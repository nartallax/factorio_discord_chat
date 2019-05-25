module.exports.safetyWrap = async action => {
	try {
		return await Promise.resolve(action())
	} catch(e){
		console.error("Discord wrapper failed!");
		console.error(e.stack);
	}
}