let fs = require("fs"),
	path = require("path"),
	
	ServerWrapper = require("./server.js"),
	DiscordBot = require("./discord.js");
	
let main = async () => {
	// без этих хендлеров процесс завершается как-то криво, не давая серверу возможности сохраниться
	process.on("SIGINT", () => {});
	process.on("SIGTERM", () => {});	
	
	let config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./config.json"), "utf8"));

	let server = new ServerWrapper(config);
	let discordBot = new DiscordBot(config);
	
	server.on("join", e => discordBot.onJoin(e.player));
	server.on("leave", e => discordBot.onLeave(e.player));
	server.on("chat", e => discordBot.onChat(e.player, e.message));
	server.on("exit", e => {
		console.error("Server stopped. Exiting.");
		discordBot.onServerStop();
		setTimeout(() => discordBot.stop(), 1000);
	});
	
	discordBot.on("message", e => server.say(e.author, e.message))
	
	console.error("Starting discord bot...");
	await discordBot.start();
	console.error("Discord bot started.");
	
	await server.start(process.argv.slice(2));
	
	discordBot.onServerStart();
}

(async () => {
	try {
		await main();
	} catch(e){
		console.error("Wrapper failed:");
		console.error(e.stack);
		process.exit(1);
	}
})();