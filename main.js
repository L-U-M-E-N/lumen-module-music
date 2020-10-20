const window = require('electron').BrowserWindow;

// Get files
global.musicList = {};

function updateFiles(callback) {
	global.musicList = {};
	let timeout = -1;

	fileScanner('MUSICPATH',/\.(mp3|ogg|flac|m4a)$/,function(filename) {
		let albumName = filename.split('\\');
		const musicName = albumName.pop();
		albumName     = albumName.join('/');

		if(musicList[albumName] === undefined) { musicList[albumName] = []; }
		musicList[albumName].push(musicName);

		if(!callback) { return; }

		clearTimeout(timeout);
		timeout = setTimeout(function() {
			window.getFocusedWindow().webContents.send('fileListUpdated', {});
		}, 250);
	});
}
updateFiles();

// Playlist manager
global.playlist           = [];
global.playlistSrc        = [];
global.orderedPlaylist    = [];
global.orderedPlaylistSrc = [];
global.playlistCurrent    = 0;
global.playlistRandom     = false;


// Events
global.musicEvents = {
	musicChanged: function() {
		global.mainWindow.webContents.send('musicChanged', {});
	},
	updateFiles: function() {
		updateFiles(true);
	}
};

ipcMain.on('updateVars', function(e, data) {
	playlist = data.playlist;
	playlistSrc = data.playlistSrc;
	orderedPlaylist = data.orderedPlaylist;
	orderedPlaylistSrc = data.orderedPlaylistSrc;
	playlistCurrent = data.playlistCurrent;
	playlistRandom = data.playlistRandom;

	musicEvents.musicChanged();
});

ipcMain.on('updateCurrent', function(e, curr) {
	playlistCurrent = curr;
});

ipcMain.on('updateRandom', function(e, curr) {
	playlistRandom = curr;
});