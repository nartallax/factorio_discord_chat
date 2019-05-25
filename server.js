let EventEmitter = require("events").EventEmitter,
	childProcess = require("child_process"),
	readline = require("readline"),
	format = require("string-format"),
	{safetyWrap} = require("./utils.js");

function luaEscape(str){
	return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "");
}

module.exports = class ServerWrapper extends EventEmitter {
	
	constructor(config){
		super();
		this.config = config;
	}
	
	async start(args){
		// запускаем сервер
		this.process = childProcess.spawn(this.config.serverExecutable, args, {
			cwd: this.config.serverWorkingDirectory,
			stdio: ["pipe", "pipe", "inherit"]
		});
		
		let started = null;
		let startPromise = new Promise(ok => started = ok);
		
		// сопоставляем обработчики и регэкспы, которыми будем парсить stdout
		let regs = [
			[/^[\d\-\s\:]+\[CHAT\]\s*([^:]+?):\s*(.*?)\s*$/, (player, message) => this.emit("chat", {player, message})],
			[/^[\d\-\s\:]+\[JOIN\]\s*(.*?)\s*joined the game/, player => this.emit("join", {player})],
			[/^[\d\-\s\:]+\[LEAVE\]\s*(.*?)\s*left the game/, player => this.emit("leave", {player})],
			[/from\(CreatingGame\) to\(InGame\)$/, () => started()],
			[/\[DEATH\]: \[(.*?)\] by \[(.*?)\]/, (dead, killer) => this.emit("player_death", {dead, killer})]
		];
		
		// читаем stdout сервера
		let serverReader = readline.createInterface({ input: this.process.stdout });
		serverReader.on("line", line => safetyWrap(() => {
			// выдаем каждое сообщение в наш stdout
			process.stdout.write(line + "\n", "utf8");
			
			// а потом пытаемся распарсить
			if(line.startsWith(this.config.discordCommandOutputPrefix)){
				line = line.split(this.config.discordNewlineSeparator).join("\n")
				this.emit("command_output", {
					output: line.substr(this.config.discordCommandOutputPrefix.length).replace(/(^\s+|\s+$)/g, "")
				});
			} else {
				for(let regAndHandler of regs){
					let match = line.match(regAndHandler[0]);
					if(match){
						regAndHandler[1](match[1], match[2]);
						break;
					}
				}
			}
		}));
		
		// прокидываем наш stdin до stdin-а сервера
		let ourReader = readline.createInterface({ input: process.stdin });
		ourReader.on("line", line => safetyWrap(() => {
			this.writeToStdout(line + "\n", "utf8");
		}));
		
		// когда процесс сервера завершился - перестаем читать наш stdin, чтобы не мешать процессу завершиться
		this.process.on("exit", () => safetyWrap(() => {
			ourReader.close();
			this.emit("exit");
		}));
		
		await startPromise;
	}
	
	writeToStdout(characters){
		this.process.stdin.write(characters, "utf8")
	}
	
	runCommand(template, params){
		Object.keys(params).forEach(paramName => {
			params[paramName] = luaEscape(params[paramName]);
		});
		
		this.process.stdin.write(format(template, params) + "\n", "utf8")
	}
	
	say(author, message, attachmentsCount){
		if(this.config.serverChatEscapeInput){
			author = luaEscape(author);
			message = luaEscape(message);
		}
		
		if(attachmentsCount > 0){
			message += (message? " ": "") + this.config.discordMessageHasAttachments;
		}
		
		process.stdout.write(format(this.config.serverStdoutChatFormat, {author, message}) + "\n", "utf8");
		this.process.stdin.write(format(this.config.serverChatFormat, {author, message}) + "\n", "utf8")
	}
	
}