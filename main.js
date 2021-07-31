const window = require('electron').BrowserWindow;
const fs = require('fs');

// Get files
let musicList = {};

// Playlist manager
let playlist           = [];
let playlistSrc        = [];
let orderedPlaylist    = [];
let orderedPlaylistSrc = [];
let playlistCurrent    = 0;
let playlistRandom     = false;

class Music {
	static _createWindow() {
		if(!Music.playerWindow) {
			Music.playerWindow = createWindowFromModule('Music-player', 'music', 'views/music-player.html', 1, 1, { show: false });

			ipcMain.on('Music-duration', (_, duration) => {
				Music.duration = duration;
			});
		}
	}

	static _setupTimeouts() {
		// First timeout to wait VLC start
		clearTimeout(Music.nextTimeout);
		Music.nextTimeout = setTimeout(() => {
			// Second timeout to go th next music
			clearTimeout(Music.nextTimeout);
			Music.nextTimeout = setTimeout(Music.playNextMusic, 1000 * (Music.duration - Music.currentTime));
		}, 2000);

		clearInterval(Music.timeInterval);
		Music.timeInterval = setInterval(() => {
			Music.currentTime ++;

			if(Music.currentTime > Music.duration) {
				Music.currentTime = Music.duration;
			}
		}, 1000);
	}

	/**
	 * Internal functions
	 */
	static async _playMusic(filePath) {
		if(!filePath) {
			return;
		}

		filePath = filePath.replaceAll('/', '\\');

		if(Music.playerCurrSrc === filePath) {
			if(!Music.playing) {
				Music.playerWindow.webContents.send('Music-play');
				Music.playing = true;
				Music._setupTimeouts();
			}

			return;
		}

		console.log('Playing ', filePath);
		try {
			if (fs.existsSync(filePath)) {
				Music._createWindow();

				Music.playerWindow.webContents.send('Music-play', filePath);
				Music.playerCurrSrc = filePath;
				Music.playing = true;

				Music.currentTime = 0;
				Music._setupTimeouts();
			} else {
				Music.playNextMusic();
			}
		} catch(err) {
			console.log('Error: ', err);

			Music.playNextMusic();
		}
	}

	static shufflePlaylist() {
		let j, x;

		for (let i = playlist.length - 1; i > 0; i--) {
			j = Math.floor(Math.random() * (i + 1));

			// Swap titles
			x = playlist[i];
			playlist[i] = playlist[j];
			playlist[j] = x;

			// Swap sources
			x = playlistSrc[i];
			playlistSrc[i] = playlistSrc[j];
			playlistSrc[j] = x;

			if(i === playlistCurrent) {
				playlistCurrent = j;
			} else if(j === playlistCurrent) {
				playlistCurrent = i;
			}
		}
	}

	static async _notifyClient() {
		if(!window.getFocusedWindow()) { return; }
		window.getFocusedWindow().webContents.send('Music-listsUpdated', {});
	}

	static async _stop() {
		Music.playing = false;
		Music._notifyClient();
	}

	/**
	 * Exposed Setters
	 */
	static addAlbum(albumID) {
		for(let i=0; i< musicList[albumID].length; i++) {
			const update = (i !== musicList[albumID].length - 1);

			Music.addMusic(albumID, i, update);
		}

		Music._notifyClient();
		Music.play();
	}

	static addMusic(albumID, musicID, albumAdd=false) {
		const newsrc = albumID + '/' + musicList[albumID][musicID];

		if(orderedPlaylistSrc.includes(newsrc)) { return; }

		orderedPlaylistSrc.push(newsrc);

		const musicName = musicList[albumID][musicID].split('.');
		musicName.pop();
		orderedPlaylist.push(musicName.join('.'));

		if(!albumAdd) {
			playlist    = orderedPlaylist.slice();
			playlistSrc = orderedPlaylistSrc.slice();

			if(playlistRandom) {
				Music.shufflePlaylist();
			}

			Music._notifyClient();
			Music.play();
		}
	}

	static clearPlayList() {
		playlist           = [];
		playlistSrc        = [];
		orderedPlaylist    = [];
		orderedPlaylistSrc = [];
		playlistCurrent    = 0;

		Music._stop();
	}

	static generatePlaylistFromMostLiked(musicScores,musicCount, randomInterval) {
		const musics = [];
		for(const albumID in musicList) {
			const album = musicList[albumID];
			for(const music of musicList[albumID]) {
				const fullPath = albumID + '/' + music;

				if(!musicScores[fullPath]) {
					musicScores[fullPath] = {
						count: 1, // Prevent divide by 0
						scoreSum: 0.5
					};
				}

				musics.push({
					...musicScores[fullPath],
					score: musicScores[fullPath].scoreSum / musicScores[fullPath].count,
					path: fullPath,
					name: music.substring(0, music.length - 4)
				});
			}
		}

		const alreadyAdded = new Set();
		const proba = randomInterval / musicCount;
		let same = 0;
		while(playlist.length <= musicCount) {
			const id = Math.floor(Math.random() * (musics.length - 1));

			if(alreadyAdded.has(id)) {
				same++;
				if(same >= musicCount / 10) { break; }
				continue;
			}

			if(Math.random() < ( proba + ((1 - proba) * musics[id].score))) {
				playlist.push(musics[id].name);
				playlistSrc.push(musics[id].path);

				orderedPlaylist.push(musics[id].name);
				orderedPlaylistSrc.push(musics[id].path);

				alreadyAdded.add(id);
				same = 0;
			}
		}

		Music.play();
	}

	static pause() {
		Music.playerWindow.webContents.send('Music-pause');
		Music.playing = false;
		clearTimeout(Music.nextTimeout);
		clearInterval(Music.timeInterval);
	}

	static play() {
		if(playlistSrc.length > 0) {
			Music._playMusic(playlistSrc[playlistCurrent]);
		}
	}

	static togglePlayPause() {
		if(Music.paused()) {
			Music.play();
		} else {
			Music.pause();
		}
	}

	static async playNextMusic() {
		await Music._stop();

		playlistCurrent = (playlistCurrent + 1) % playlistSrc.length;
		Music._playMusic(playlistSrc[playlistCurrent]);
	}

	static async playPrevMusic() {
		await Music._stop();

		playlistCurrent = (playlistSrc.length + playlistCurrent - 1) % playlistSrc.length;
		Music._playMusic(playlistSrc[playlistCurrent]);
	}

	static async chooseMusic(playListMusicId) {
		playListMusicId = parseInt(playListMusicId, 10);
		if(Number.isNaN(playListMusicId) || playListMusicId < 0 || playListMusicId >= playlist.length) {
			return;
		}

		playlistCurrent = playListMusicId;
		Music._playMusic(playlistSrc[playlistCurrent]);
	}

	static removeFromPlayList() {
		const orderedId = orderedPlaylist.indexOf(playlist[currId]);

		playlist.splice(currId,1);
		playlistSrc.splice(currId,1);

		orderedPlaylist.splice(orderedId,1);
		orderedPlaylistSrc.splice(orderedId,1);

		if(currId === playlistCurrent) {
			Music.playNextMusic();
		}

		Music._notifyClient();
	}

	static setVolume(volume) {
		Music._createWindow();

		Music.playerWindow.webContents.send('Music-volume', volume);
		Music.volume = volume;
	}

	static updateFilesList() {
		musicList = {};
		let timeout = -1;

		fileScanner('G:/Musique',/\.(mp3|ogg|flac|m4a)$/,function(filename) {
			let albumName = filename.split('\\');
			const musicName = albumName.pop();
			albumName     = albumName.join('/');

			if(musicList[albumName] === undefined) { musicList[albumName] = []; }
			musicList[albumName].push(musicName);

			// Notify client only when we don't have files added to the list anymore
			clearTimeout(timeout);
			timeout = setTimeout(function() {
				Music._notifyClient();
			}, 250);
		});
	}

	/**
	 * Exposed Getters
	 */
	static getCurrentTime() {
		if(!Music.currentTime) {
			return 0;
		}

		return Music.currentTime;
	}

	static getCurrentMusicTitle() {
		return playlist[playlistCurrent] || '';
	}

	static getCurrentMusicPath() {
		return playlistSrc[playlistCurrent] || '';
	}

	static getDuration() {
		if(!Music.duration) {
			return 0;
		}

		return Music.duration;
	}

	static getVolume() {
		if(!Music.volume) {
			return 0;
		}

		return Music.volume;
	}

	static isPlaylistRandom() {
		return playlistRandom;
	}

	static toggleRandom() {
		playlistRandom = !playlistRandom;

		if(playlistRandom) {
			Music.shufflePlaylist();
		} else {
			for(let i=0; i<orderedPlaylistSrc.length; i++) {
				if(orderedPlaylistSrc[i] === playlistSrc[playlistCurrent]) {
					playlistCurrent = i;
					break;
				}
			}

			playlist    = orderedPlaylist.slice();
			playlistSrc = orderedPlaylistSrc.slice();
		}

		Music._notifyClient();

	}

	static paused() {
		if(!Music.playerWindow) {
			return true;
		}

		return !Music.playing;
	}
}

Music.updateFilesList();

// EVENTS
ipcMain.on('Music-addAlbum', (_, albumid) => Music.addAlbum(albumid));
ipcMain.on('Music-addMusic', (_, albumid, musicid) => Music.addMusic(albumid, musicid));
ipcMain.on('Music-chooseMusic', (_, currId) => Music.chooseMusic(currId));
ipcMain.on('Music-clearPlayList', Music.clearPlayList);
ipcMain.on('Music-generatePlaylistFromMostLiked', (_, musicScores,musicCount, randomInterval) => Music.generatePlaylistFromMostLiked(musicScores,musicCount, randomInterval));
ipcMain.on('Music-playPrevMusic', Music.playPrevMusic);
ipcMain.on('Music-playNextMusic', Music.playNextMusic);
ipcMain.on('Music-removeFromPlayList', (_, currId) => Music.removeFromPlayList(currId));
ipcMain.on('Music-setVolume', (_, volume) => Music.setVolume(volume));
ipcMain.on('Music-shufflePlaylist', Music.shufflePlaylist);
ipcMain.on('Music-togglePlayPause', Music.togglePlayPause);
ipcMain.on('Music-updateFilesList', Music.updateFilesList);

ipcMain.handle('Music-getCurrentMusicPath', Music.getCurrentMusicPath);
ipcMain.handle('Music-getCurrentMusicTitle', Music.getCurrentMusicTitle);
ipcMain.handle('Music-getCurrentTime', Music.getCurrentTime);
ipcMain.handle('Music-getDuration', Music.getDuration);
ipcMain.handle('Music-isPlaylistRandom', Music.isPlaylistRandom);
ipcMain.handle('Music-paused', Music.paused);
ipcMain.handle('Music-musicList', () => musicList);
ipcMain.handle('Music-playlist', () => playlist);
ipcMain.handle('Music-playlistSrc', () => playlistSrc);
ipcMain.handle('Music-playlistCurrent', () => playlistCurrent);
ipcMain.handle('Music-toggleRandom', Music.toggleRandom);
