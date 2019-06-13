import * as Discord from "discord.js";
import {parse as parseShellCommand} from "shell-quote";
import {MapObject, safetyWrap} from "utils";
import {Actions, CommandDefinition, CommandDefinitionWithAdditions} from "command_def";
import {EventEmitter} from "events";
import * as format from "string-format";

export interface DiscordBotCommandEvent {
	actions: Actions;
	params: MapObject<string>;
}

export interface DiscordBotChatEvent {
	author: string;
	message: string;
	attachmentCount: number;
}

export interface DiscordBotConfig {
	token: string;
	channelId: string;
	autoHelp: boolean;
	commands: MapObject<CommandDefinition>;
	commandNotAllowedFormat: string;
	userLists: MapObject<string[]>;
}

interface DiscordBotEventDefinitions {
	on(event: "command", listener: (e: DiscordBotCommandEvent) => void): this;
	on(event: "chat", listener: (e: DiscordBotChatEvent) => void): this;
}

export class DiscordBot extends EventEmitter implements DiscordBotEventDefinitions {

	private readonly config: DiscordBotConfig;

	private _client: Discord.Client | null = null;
	private get client(): Discord.Client {
		if(!this._client)
			throw new Error("Discord bot not launched.");
		return this._client;
	}

	private _channel: (Discord.Channel & Discord.PartialTextBasedChannelFields) | null = null;
	private get channel(): Discord.Channel & Discord.PartialTextBasedChannelFields {
		if(!this._channel)
			throw new Error("Discord bot not launched.");
		return this._channel;
	}

	private userId: string | null = null;
	private readonly commands: MapObject<DiscordCommand> = {};

	
	constructor(config: DiscordBotConfig){
		super();
		
		this.config = config;
		
		Object.keys(config.commands).forEach(commandTemplate => {
			let def = config.commands[commandTemplate];
			this.registerCommand(commandTemplate, def);
		});

		if(config.autoHelp){
			let helpText = ""
			Object.keys(this.commands).map(k => this.commands[k]).forEach(command => {
				Object.keys(command.overloads).map(k => command.overloads[k]).forEach(overload => {
					helpText += (helpText? "\n": "") 
						+ "**" + command.name + "**" 
						+ (overload.argNames.length > 0? " ": "") 
						+ overload.argNames.join(" ");
					if(typeof(overload.def) === "object" && (overload.def as CommandDefinitionWithAdditions).description){
						helpText += ": " + (overload.def as CommandDefinitionWithAdditions).description;
					}
				});
			});
			this.registerCommand("!help", {
				description: "Показать список команд",
				actions: [
					{discordMessage: helpText}
				]
			} as CommandDefinitionWithAdditions);
		}
	}

	private registerCommand(commandTemplate: string, def: CommandDefinition){
		let [commandName, ...argNames] = commandTemplate.split(" ");
		if(!(commandName in this.commands)){
			this.commands[commandName] = new DiscordCommand(commandName);
		}
		
		let cmd = this.commands[commandName];
		cmd.addOverload(argNames, def);
	}

	private isAuthorized(user: Discord.User, def: CommandDefinitionWithAdditions): boolean {
		if(!def.userList)
			return true;
		let lists = Array.isArray(def.userList)? def.userList: [def.userList];
		let tag = user.tag
		for(let listName of lists)
			for(let listTag of this.config.userLists[listName])
				if(listTag === tag)
					return true;
		return false;
	}
	
	async start(){
		this._client = new Discord.Client();
		
		this.client.on("message", msg => safetyWrap(() => {
			if(msg.channel.id === this.config.channelId && msg.author.id !== this.userId){
				let guild = msg.guild;
				let hasGuild = guild && guild.available;
				
				let username = msg.author.username;
				let member = !hasGuild? null: guild.member(msg.author);
				let nick = !member? username: member.displayName;
				
				let cmdParts = parseShellCommand(msg.cleanContent) as string[];
				
				if(cmdParts[0] in this.commands){
					let {args, def} = this.commands[cmdParts[0]].selectOverload(cmdParts.slice(1));
					let fullParams = {
						username,
						nick,
						arg_count: (cmdParts.length - 1) + "",
						command_name: cmdParts[0],
						...args
					} as MapObject<string>

					let actions: Actions;
					let defWithAdd = def as CommandDefinitionWithAdditions;
					if(Array.isArray(defWithAdd.actions)){
						actions = defWithAdd.actions;
						if(!this.isAuthorized(msg.author, defWithAdd)){
							this.sendMessage(format(this.config.commandNotAllowedFormat, fullParams));
							return;
						}
					} else {
						actions = def as Actions;
					}
					
					this.emit("command", {
						actions,
						params: fullParams
					} as DiscordBotCommandEvent);
				} else {
					this.emit("chat", {
						author: nick, 
						message: msg.cleanContent, 
						attachmentCount: msg.attachments.size
					} as DiscordBotChatEvent);
				}
			}
		}));
		
		await this.client.login(this.config.token);
		
		let channel = this.client.channels.get(this.config.channelId);;
		if(!channel){
			throw new Error("Unknown channel ID: " + this.config.channelId + ".");
		} else {
			this._channel = channel as Discord.Channel & Discord.PartialTextBasedChannelFields;
		}
		
		this.userId = this.client.user.id;
	}
	
	stop(){
		this.client.destroy();
	}
	
	sendMessage(msg: string){
		this.channel.send(msg);
	}
}

interface DiscordCommandOverload {
	argNames: string[];
	def: CommandDefinition
}

class DiscordCommand {
	readonly name: string;
	readonly overloads: MapObject<DiscordCommandOverload>;
	
	constructor(name: string){
		this.name = name;
		this.overloads = {};
	}
	
	addOverload(argNames: string[], def: CommandDefinition){
		if(!!this.overloads[argNames.length]){
			throw new Error("Failed to register overload of command " + this.name + ": already has overload with this number of arguments (" + argNames.length + ")");
		}
		
		this.overloads[argNames.length] = { argNames, def };
	}
	
	selectOverload(argsArray: string[]): {args: MapObject<string>, def: CommandDefinition}{
		let argMap = {} as MapObject<string>;
		
		let argCount = argsArray.length;
		while(!this.overloads[argCount] && argCount >= 0){
			argCount--;
		}
		
		if(argCount < 0){
			throw new Error("Failed to execute command " + this.name + ": incorrect number of arguments.");
		}
		
		let { argNames, def } = this.overloads[argCount];
		
		for(let i = 0; i < argCount; i++){
			argMap[argNames[i]] = argsArray[i];
		}
		
		return {args: argMap, def }
	}
	
}