let EventEmitter = require("events").EventEmitter,
	Discord = require("discord.js"),
	format = require("string-format");

module.exports = class DiscordBot extends EventEmitter {
	
	constructor(config){
		super();
		this.config = config;
	}
	
	async start(){
		this.client = new Discord.Client();
		
		this.client.on("message", msg => {
			if(msg.channel.id === this.config.channelId && msg.author.id !== this.userId){
				let guild = msg.guild;
				let hasGuild = guild && guild.available;
				
				let username = msg.author.username;
				let nick = hasGuild? guild.member(msg.author).displayName: username;
				
				if(msg.content in this.config.discordCommands){
					this.emit("command", {
						command: this.config.discordCommands[msg.content],
						args: {
							username,
							nick,
							pref: this.config.discordCommandOutputPrefix
						}
					})
				} else {
					this.emit("message", {author: nick, message: msg.content, attachmentCount: msg.attachments.size});
				}
			}
		});
		
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