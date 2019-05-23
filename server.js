let EventEmitter = require("events").EventEmitter,
	childProcess = require("child_process"),
	readline = require("readline"),
	format = require("string-format");

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
			[/from\(CreatingGame\) to\(InGame\)$/, () => started()]
		];
		
		// читаем stdout сервера
		let serverReader = readline.createInterface({ input: this.process.stdout });
		serverReader.on("line", line => {
			// выдаем каждое сообщение в наш stdout
			process.stdout.write(line + "\n", "utf8");
			
			// а потом пытаемся распарсить
			for(let regAndHandler of regs){
				let match = line.match(regAndHandler[0]);
				if(match){
					regAndHandler[1](match[1], match[2]);
					break;
				}
			}
		});
		
		// прокидываем наш stdin до stdin-а сервера
		let ourReader = readline.createInterface({ input: process.stdin });
		ourReader.on("line", line => {
			this.writeToStdout(line + "\n", "utf8");
		});
		
		// когда процесс сервера завершился - перестаем читать наш stdin, чтобы не мешать процессу завершиться
		this.process.on("exit", () => {
			ourReader.close();
			this.emit("exit");
		});
		
		await startPromise;
	}
	
	writeToStdout(characters){
		this.process.stdin.write(characters, "utf8")
	}
	
	say(author, message){
		if(this.config.serverChatEscapeInput){
			author = luaEscape(author);
			message = luaEscape(message);
		}
		
		this.process.stdin.write(format(this.config.serverChatFormat, {author, message}) + "\n", "utf8")
	}
	
}