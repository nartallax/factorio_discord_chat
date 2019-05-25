let fs = require("fs"),
	path = require("path"),
	
	ServerWrapper = require("./server.js"),
	DiscordBot = require("./discord.js"),
	{safetyWrap} = require("./utils.js");

let main = async () => {
	// без этих хендлеров процесс завершается как-то криво, не давая серверу возможности сохраниться
	process.on("SIGINT", () => {});
	process.on("SIGTERM", () => {});	
	
	let config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./config.json"), "utf8"));

	let server = new ServerWrapper(config);
	let discordBot = new DiscordBot(config);
	
	server.on("join", e => safetyWrap(() => discordBot.onJoin(e.player)));
	server.on("leave", e => safetyWrap(() => discordBot.onLeave(e.player)));
	server.on("chat", e => safetyWrap(() => discordBot.onChat(e.player, e.message)));
	server.on("exit", e => safetyWrap(() => {
		console.error("Server stopped. Exiting.");
		discordBot.onServerStop();
		setTimeout(() => discordBot.stop(), 1000);
	}));
	server.on("command_output", e => safetyWrap(() => discordBot.say(e.output)));
	server.on("player_death", e => safetyWrap(() => discordBot.onPlayerDeath(e.dead, e.killer)));
	
	discordBot.on("message", e => safetyWrap(() => server.say(e.author, e.message, e.attachmentCount)))
	discordBot.on("command", e => safetyWrap(() => server.runCommand(e.command, e.args)));
	
	console.error("Starting discord bot...");
	await discordBot.start();
	console.error("Discord bot started.");
	
	await server.start(process.argv.slice(2));
	
	discordBot.onServerStart();
}

safetyWrap(main);