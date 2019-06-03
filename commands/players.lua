/silent-command 
local names = {{}} 
for _, player in pairs(game.players) do 
	if(player.connected) then 
		names[#names + 1] = player.name 
	end 
end 

print('{pref}Игроки онлайн:{n}' .. table.concat(names, '{n}'))