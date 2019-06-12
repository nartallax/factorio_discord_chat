import {EventEmitter} from "events";
import * as childProcess from "child_process";
import * as readline from "readline";
import {safetyWrap} from "utils";
import {Writable} from "stream";

export interface GameServerOptions {
	executablePath: string;
	workingDirectory: string;
	runParams: string[];
	commandOutputPrefix: string;
	commandOutputNewlineSeparator: string;
}

export interface OnePlayerEvent {
	player: string;
}

export interface PlayerChatEvent {
	player: string;
	message: string
}

export interface PlayerDeathEvent {
	dead: string;
	killer: string;
}

export interface CommandOutputEvent {
	output: string;
}

interface GameServerEventsDefinition {
	on(event: "chat", listener: (e: PlayerChatEvent) => void): this;
	on(event: "join", listener: (e: OnePlayerEvent) => void): this;
	on(event: "leave", listener: (e: OnePlayerEvent) => void): this;
	on(event: "player_death", listener: (e: PlayerDeathEvent) => void): this;
	on(event: "command_output", listener: (e: CommandOutputEvent) => void): this;
	on(event: "server_start", listener: () => void): this;
	on(event: "server_stop", listener: () => void): this;
}

export class GameServer extends EventEmitter implements GameServerEventsDefinition {
	private readonly config: GameServerOptions;
	private _process: childProcess.ChildProcess | null = null;
	private get process(): childProcess.ChildProcess {
		if(!this._process)
			throw new Error("Game server not started.");
		return this._process;
	}

	private _rebooting: boolean = false;
	get rebooting(): boolean {
		return this._rebooting;
	}
	
	constructor(config: GameServerOptions){
		super();
		this.config = config;
	}
	
	async start(): Promise<void>{
		this._process = childProcess.spawn(this.config.executablePath, this.config.runParams, {
			cwd: this.config.workingDirectory,
			stdio: ["pipe", "pipe", "inherit"]
		});
		
		let startedCallback: (() => void) | null = null;
		let startPromise = new Promise<void>(ok => startedCallback = ok);
		
		// сопоставляем обработчики и регэкспы, которыми будем парсить stdout
		let regs = [
			[/^[\d\-\s\:]+\[CHAT\]\s*([^:]+?):\s*(.*?)\s*$/, (player, message) => this.emit("chat", {player, message} as PlayerChatEvent)],
			[/^[\d\-\s\:]+\[JOIN\]\s*(.*?)\s*joined the game/, player => this.emit("join", {player} as OnePlayerEvent)],
			[/^[\d\-\s\:]+\[LEAVE\]\s*(.*?)\s*left the game/, player => this.emit("leave", {player} as OnePlayerEvent)],
			[/from\(CreatingGame\) to\(InGame\)$/, () => startedCallback && startedCallback()],
			[/\[DEATH\]: \[(.*?)\] by \[(.*?)\]/, (dead, killer) => this.emit("player_death", {dead, killer} as PlayerDeathEvent)]
		] as ([RegExp, (...args: string[]) => void])[];
		
		// читаем stdout сервера
		let serverReader = readline.createInterface({ input: this.process.stdout as NodeJS.ReadableStream });
		serverReader.on("line", line => safetyWrap(() => {
			// выдаем каждое сообщение в наш stdout
			process.stdout.write(line + "\n", "utf8");
			
			// а потом пытаемся распарсить
			if(line.startsWith(this.config.commandOutputPrefix)){
				line = line.split(this.config.commandOutputNewlineSeparator).join("\n")
				this.emit("command_output", {
					output: line.substr(this.config.commandOutputPrefix.length).replace(/(^\s+|\s+$)/g, "")
				} as CommandOutputEvent);
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
		ourReader.on("line", line => safetyWrap(() => this.writeLine(line)));
		
		// когда процесс сервера завершился - перестаем читать наш stdin, чтобы не мешать процессу завершиться
		this.process.on("exit", () => safetyWrap(() => {
			ourReader.close();
			this.emit("server_stop");
		}));
		
		await startPromise;
		this.emit("server_start");
	}

	stop(): Promise<void>{
		let prom = new Promise<void>(ok => this.once("server_stop", ok));
		this.process.kill("SIGINT");
		return prom;
	}
	
	writeLine(line: string): void {
		(this.process.stdin as Writable).write(line + "\n", "utf8")
	}

	async reboot(): Promise<void> {
		this._rebooting = true;
		try {
			await this.stop();
			await this.start();
		} finally {
			this._rebooting = false;
		}
		
	}
	
}