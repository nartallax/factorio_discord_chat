import {readTextFile, safetyWrap, MapObject} from "utils";
import * as path from "path";
import {DiscordBot, DiscordBotChatEvent} from "bot";
import {CommandRunner} from "command";
import {GameServer} from "game_server";
import * as format from "string-format";

export function main(){
	safetyWrap(asyncMain);
}

async function createDiscordBot(config: any): Promise<DiscordBot>{
	let botToken = (await readTextFile(path.resolve(__dirname, config.botTokenFile))).trim();
	let botChannelId = (await readTextFile(path.resolve(__dirname, config.channelId))).trim();
	return new DiscordBot({
		token: botToken,
		channelId: botChannelId,
		commands: config.discordCommands,
		commandNotAllowedFormat: config.discordCommandNotAllowedFormat,
		userLists: config.userLists
	});
}

async function createGameServer(config: any): Promise<GameServer>{
	return new GameServer({
		executablePath: path.resolve(__dirname, config.serverExecutable),
		workingDirectory: path.resolve(__dirname, config.serverWorkingDirectory),
		runParams: process.argv.slice(2),
		commandOutputNewlineSeparator: config.discordNewlineSeparator,
		commandOutputPrefix: config.discordCommandOutputPrefix
	});
}

function wireUpDiscordBot(config: any, discordBot: DiscordBot, commandRunner: CommandRunner){
	let commandConstantParams = {
		n: config.discordNewlineSeparator,
		pref: config.discordCommandOutputPrefix
	}
	
	discordBot.on("command", e => safetyWrap(async () => {
		let params = {
			...commandConstantParams,
			...e.params
		}
		await commandRunner.run(e.actions, params)
	}));

	discordBot.on("chat", (e: DiscordBotChatEvent) => safetyWrap(async () => {
		let params = {
			author: e.author,
			message: e.message,
			attachments_count: e.attachmentCount + "",
			...commandConstantParams
		} as MapObject<string>;

		params["attachment_string"] = e.attachmentCount < 1? "": format(config.discordMessageHasAttachments, params);

		await commandRunner.run({
			command: config.serverChatFormat
		}, params);

		process.stdout.write(format(config.serverStdoutChatFormat, params) + "\n", "utf8");
	}));
}

function wireUpGameServer(config: any, server: GameServer, commandRunner: CommandRunner){
	server.on("chat", e => safetyWrap(async () => await commandRunner.run({discordMessage: config.discordChatFormat}, e)));
	server.on("join", e => safetyWrap(async () => await commandRunner.run({discordMessage: config.discordJoinFormat}, e)));
	server.on("leave", e => safetyWrap(async () => await commandRunner.run({discordMessage: config.discordLeaveFormat}, e)));
	server.on("player_death", e => safetyWrap(async () => {
		await commandRunner.run({discordMessage: e.killer? config.discordPlayerKilledFormat: config.discordPlayerDiedFormat}, e)
	}));
	server.on("server_start", e => safetyWrap(async () => {
		await commandRunner.run({discordMessage: config.discordServerStarted}, e)
		await commandRunner.run(config.onServerStart, {});
	}));
	server.on("server_stop", e => safetyWrap(async () => await commandRunner.run({discordMessage: config.discordServerStopped}, e)));
	server.on("command_output", e => safetyWrap(async () => await commandRunner.run({discordMessage: e.output}, {})))
}

async function asyncMain(){
	let config = JSON.parse(await readTextFile(path.resolve(__dirname, "./config.json")));

	let discordBot = await createDiscordBot(config);
	let server = await createGameServer(config);

	let commandRunner: CommandRunner = new CommandRunner({
		discord: discordBot, 
		server,
		shellWorkingDirectory: path.resolve(__dirname, config.serverWorkingDirectory)
	});
	wireUpDiscordBot(config, discordBot, commandRunner);
	wireUpGameServer(config, server, commandRunner);

	server.on("server_stop", () => safetyWrap(() => {
		if(!server.rebooting){
			console.error("Server shut down. Terminating wrapper.");
			setTimeout(() => {
				discordBot.stop();
			}, 1000);
		}
	}));
	
	console.error("Starting discord bot...");
	await discordBot.start();
	console.error("Discord bot started.");

	// без этих хендлеров процесс завершается как-то криво, не давая серверу возможности сохраниться
	process.on("SIGINT", () => {});
	process.on("SIGTERM", () => {});
	await server.start();
}