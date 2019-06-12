import {Actions, SleepAction, ServerCommandLiteralAction, ServerCommandFileAction, DiscordMessageAction, ShellLiteralAction, ShellFileAction} from "command_def";
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
			} else if("discordMessage" in action){
				await this.runDiscordMessageAction(action, params);
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
		await new Promise<[string, string]>((ok, bad) => cp.exec(
			completeCmd,
			{
				cwd: this.options.shellWorkingDirectory
			},
			(err, stdout, stderr) => {
				if(err) {
					bad(err);
				} else {
					ok([stdout, stderr]);
				}
			})
		);
	}
	
	private async runShellFileAction(action: ShellFileAction, params: MapObject<string>){
		let formatString = await readTextFile(path.resolve(__dirname, action.shellFile));
		await this.runShellLiteralAction({shell: formatString}, params);
	}

}