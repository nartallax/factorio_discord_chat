Враппер для сервера Factorio для интеграции с чатом Discord.
Не забудьте поковырять config.json, прежде чем запускать.
Писалось под nodejs 10.15.3, под Debian 9.3. Возможно, заработает под чем-нибудь еще, но это не точно.
запуск: node main.js [...прочие аргументы, которые будут переданы серверу]

Например: node main.js --start-server save.zip --server-settings data/server-settings.json