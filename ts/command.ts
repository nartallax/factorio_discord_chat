import {Actions, SleepAction, ServerCommandLiteralAction, ServerCommandFileAction, DiscordMessageAction, ShellLiteralAction, ShellFileAction, WaitRegexpLineAction, WaitIncludeLineAction, StopAction, StartAction, ShellParametrizedAction, ShellActionFlags} from "command_def";
import {DiscordBot} from "bot";
import {GameServer} from "game_server";
import {MapObject, readTextFile, luaEscapeParams} from "utils";
import * as format from "string-format";
import * as cp from "child_process";
import * as path from "path";

export interface CommandRunnerOptions {
	discord: DiscordBot;
	server: GameServer;
	shellWorkingDirectory: string;
}

export class CommandRunner {

	readonly discord: DiscordBot;
	readonly server: GameServer;
	private readonly options: CommandRunnerOptions;

	constructor(opts: CommandRunnerOptions){
		this.discord = opts.discord;
		this.server = opts.server;
		this.options = opts;
	}

	private resolveActionsToExtendeds(def: Actions){
		let arr = Array.isArray(def)? def: [def];
		return arr.map(x => typeof(x) === "string"? {command: x}: x)
	}

	async run(actions: Actions, params: MapObject<string>){
		for(let action of this.resolveActionsToExtendeds(actions)){
			if("sleep" in action){
				await this.runSleepAction(action);
			} else if("command" in action){
				await this.runCommandLiteralAction(action, params)
			} else if("commandFile" in action){
				await this.runCommandFileAction(action, params);
			} else if("reboot" in action){
				await this.runRebootAction();
			} else if("shell" in action){
				await this.runShellLiteralAction(action, params);
			} else if("shellFile" in action){
				await this.runShellFileAction(action, params);
			} else if("shellExec" in action){
				await this.runShellExecAction(action, params);
			} else if("discordMessage" in action){
				await this.runDiscordMessageAction(action, params);
			} else if("waitLineIncludes" in action){
				await this.runWaitIncludeLineAction(action);
			} else if("waitLineRegexp" in action){
				await this.runWaitRegexpLineAction(action);
			} else if("stop" in action){
				await this.runStopAction(action);
			} else if("start" in action){
				await this.runStartAction(action);
			} else {
				throw new Error("Couldn't recognize action type from definition: " + JSON.stringify(action));
			}
		}
	}

	private async runSleepAction(action: SleepAction){
		await new Promise(ok => setTimeout(ok, action.sleep));
	}

	private async runCommandLiteralAction(action: ServerCommandLiteralAction, params: MapObject<string>){
		let completeCmd = format(action.command, luaEscapeParams(params));
		this.server.writeLine(completeCmd);
	}

	private async runCommandFileAction(action: ServerCommandFileAction, params: MapObject<string>){
		let formatString = (await readTextFile(path.resolve(__dirname, action.commandFile))).replace(/[\n\r]+/g, " ");
		await this.runCommandLiteralAction({command: formatString}, params);
	}

	private async runRebootAction(){
		await this.server.reboot();
	}

	private async runDiscordMessageAction(action: DiscordMessageAction, params: MapObject<string>){
		let completeMsg = format(action.discordMessage, params);
		await this.discord.sendMessage(completeMsg);
	}

	private async runShellLiteralAction(action: ShellLiteralAction, params: MapObject<string>){
		let completeCmd = format(action.shell, params);
		await new Promise((ok, bad) => cp.exec(
			completeCmd,
			{
				cwd: this.options.shellWorkingDirectory,
				maxBuffer: 512 * 1024 * 1024
			},
			async (err, stdout, stderr) => {
				try {
					await this.doWithShellOutput(stdout, stderr, action);
				} catch(e) { bad(e) }
				err? bad(err): ok();
			})
		);
	}

	private async runShellFileAction(action: ShellFileAction, params: MapObject<string>){
		let formatString = await readTextFile(path.resolve(__dirname, action.shellFile));
		await this.runShellLiteralAction({shell: formatString}, params);
	}

	private async runShellExecAction(action: ShellParametrizedAction, params: MapObject<string>){
		let command = format(action.shellExec, params);
		let args = (action.args || []).map(arg => format(arg, params));
		await new Promise((ok, bad) => cp.execFile(command, args, {
			cwd: this.options.shellWorkingDirectory,
			maxBuffer: 512 * 1024 * 1024,
		}, async (err, stdout, stderr) => {
			try {
				await this.doWithShellOutput(stdout, stderr, action);
			} catch(e) { bad(e) }
			err? bad(err): ok();
		}));
	}

	private async doWithShellOutput(stdout: string, stderr: string, flags: ShellActionFlags){
		if(flags.stdoutToDiscord){
			if(flags.stdoutCodeWrap)
				stdout = "```\n" + stdout + "\n```";
			await this.discord.sendMessage(stdout);
		}
		if(flags.stderrToDiscord){
			if(flags.stderrCodeWrap)
				stderr = "```\n" + stderr + "\n```";
			await this.discord.sendMessage(stderr);
		}
	}
	
	private async runWaitRegexpLineAction(action: WaitRegexpLineAction){
		let regexp = new RegExp(action.waitLineRegexp);
		await this.server.waitLine(line => !!line.match(regexp));
	}

	private async runWaitIncludeLineAction(action: WaitIncludeLineAction){
		await this.server.waitLine(line => line.includes(action.waitLineIncludes));
	}

	private async runStopAction(action: StopAction){
		void action;
		await this.server.stop();
	}

	private async runStartAction(action: StartAction){
		void action;
		await this.server.start();
	}
}