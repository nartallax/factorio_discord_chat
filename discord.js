let EventEmitter = require("events").EventEmitter,
	Discord = require("discord.js"),
	format = require("string-format"),
	parseCommand = require("shell-quote").parse,
	{safetyWrap} = require("./utils.js");

class Command {
	
	constructor(name){
		this.name = name;
		this.overloads = {};
	}
	
	addOverload(argNames, code){
		if(!!this.overloads[argNames.length]){
			throw new Error("Failed to register overload of command " + this.name + ": already has overload with this number of arguments (" + argNames.length + ")");
		}
		
		this.overloads[argNames.length] = { argNames, code };
	}
	
	selectOverload(argsArray){
		let argMap = {};
		
		let argCount = argsArray.length;
		while(!this.overloads[argCount] && argCount >= 0){
			argCount--;
		}
		
		if(argCount < 0){
			throw new Error("Failed to execute command " + this.name + ": incorrect number of arguments.");
		}
		
		let { argNames, code } = this.overloads[argCount];
		
		for(let i = 0; i < argCount; i++){
			argMap[argNames[i]] = argsArray[i];
		}
		
		return {args: argMap, code}
	}
	
}
	
module.exports = class DiscordBot extends EventEmitter {
	
	constructor(config){
		super();
		this.config = config;
		
		this.commands = {};
		Object.keys(this.config.discordCommands).forEach(commandTemplate => {
			let commandCode = this.config.discordCommands[commandTemplate];
			let [commandName, ...argNames] = commandTemplate.split(" ");
			if(!(commandName in this.commands)){
				this.commands[commandName] = new Command(commandName);
			}
			
			let cmd = this.commands[commandName];
			cmd.addOverload(argNames, commandCode);
		});
	}
	
	async start(){
		this.client = new Discord.Client();
		
		this.client.on("message", msg => safetyWrap(() => {
			if(msg.channel.id === this.config.channelId && msg.author.id !== this.userId){
				let guild = msg.guild;
				let hasGuild = guild && guild.available;
				
				let username = msg.author.username;
				let nick = hasGuild? guild.member(msg.author).displayName: username;
				
				let cmdParts = parseCommand(msg.content);
				
				if(cmdParts[0] in this.commands){
					let {args, code} = this.commands[cmdParts[0]].selectOverload(cmdParts.slice(1));
					
					this.emit("command", {
						command: code,
						args: {
							username,
							nick,
							n: this.config.discordNewlineSeparator,
							pref: this.config.discordCommandOutputPrefix,
							...args
						}
					})
				} else {
					this.emit("message", {author: nick, message: msg.content, attachmentCount: msg.attachments.size});
				}
			}
		}));
		
		await this.client.login(this.config.botToken);
		
		this.channel = this.client.channels.get(this.config.channelId);
		if(!this.channel){
			throw new Error("Unknown channel ID: " + this.config.channelId + ".");
		}
		
		this.userId = this.client.user.id;
	}
	
	stop(){
		this.client.destroy();
	}
	
	say(msg){
		this.channel.send(msg);
	}
	
	onChat(player, message){
		this.say(format(this.config.discordChatFormat, {player, message}));
	}
	
	onJoin(player){
		this.say(format(this.config.discordJoinFormat, {player}));
	}
	
	onLeave(player){
		this.say(format(this.config.discordLeaveFormat, {player}));
	}
	
	onServerStart(){
		this.say(this.config.discordServerStarted);
	}
	
	onServerStop(){
		this.say(this.config.discordServerStopped);
	}
	
	onPlayerDeath(dead, killer){
		let formatStr = killer? this.config.discordPlayerKilledFormat: this.config.discordPlayerDiedFormat;
		this.say(format(formatStr, {dead, killer}));
	}
	
}