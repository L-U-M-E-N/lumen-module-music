const window = require('electron').BrowserWindow;

const Audic = require('audic');
const fs = require('fs');

// Get files
global.musicList = {};

// Playlist manager
global.playlist           = [];
global.playlistSrc        = [];
global.orderedPlaylist    = [];
global.orderedPlaylistSrc = [];
global.playlistCurrent    = 0;
global.playlistRandom     = false;

class Music {
	/**
	 * Internal functions
	 */
	static async _playMusic(filePath) {
		if(!filePath) {
			return;
		}

		filePath = filePath.replaceAll('/', '\\');

		if(Music.player && Music.player.src === filePath) {
			return;
		}

		console.log('Playing ', filePath);
		try {
			if (fs.existsSync(filePath)) {
				Music.player = new Audic(filePath);
				await Music.player.play();

				// First timeout to wait VLC start
				clearTimeout(Music.nextTimeout);
				Music.nextTimeout = setTimeout(() => {
					// Second timeout to go th next music
					clearTimeout(Music.nextTimeout);
					Music.nextTimeout = setTimeout(Music.playNextMusic, 1000 * (Music.player.duration));
				}, 2000);
			} else {
				Music.playNextMusic();
			}
		} catch(err) {
			console.log('Error: ', err);

			Music.playNextMusic();
		}
	}

	static _shufflePlaylist() {
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

	/**
	 * Exposed Setters
	 */
	static pause() {
		if(Music.player) {
			Music.player.pause();
		}
	}

	static play() {
		if(playlistSrc.length > 0) {
			Music._playMusic(playlistSrc[playlistCurrent]);
		}
	}

	static async playNextMusic() {
		if(Music.player) {
			await Music.player.destroy();
			Music.player = null;
		}

		playlistCurrent = (playlistCurrent + 1) % playlistSrc.length;
		Music._playMusic(playlistSrc[playlistCurrent]);
	}

	static async playPrevMusic() {
		if(Music.player) {
			await Music.player.destroy();
			Music.player = null;
		}

		playlistCurrent = (playlistSrc.length + playlistCurrent - 1) % playlistSrc.length;
		Music._playMusic(playlistSrc[playlistCurrent]);
	}

	static setVolume(volume) {
		if(Music.player) {
			Music.player.volume = volume;
		}
	}

	static updateFilesList() {
		musicList = {};
		let timeout = -1;

		fileScanner('MUSICPATH',/\.(mp3|ogg|flac|m4a)$/,function(filename) {
			let albumName = filename.split('\\');
			const musicName = albumName.pop();
			albumName     = albumName.join('/');

			if(musicList[albumName] === undefined) { musicList[albumName] = []; }
			musicList[albumName].push(musicName);

			// Notify client only when we don't have files added to the list anymore
			clearTimeout(timeout);
			timeout = setTimeout(function() {
				window.getFocusedWindow().webContents.send('fileListUpdated', {});
			}, 250);
		});
	}

	/**
	 * Exposed Getters
	 */
	static getCurrentTime() {
		if(!Music.player) {
			return 0;
		}

		return Music.player._currentTime;
	}

	static getCurrentMusicTitle() {
		return playlist[playlistCurrent] || '';
	}

	static getCurrentMusicPath() {
		return playlistSrc[playlistCurrent] || '';
	}

	static getDuration() {
		if(!Music.player) {
			return 0;
		}

		return Music.player.duration;
	}

	static getVolume() {
		if(!Music.player) {
			return 0;
		}

		return Music.player.volume;
	}

	static async isPlaylistRandom() {
		return playlistRandom;
	}

	static paused() {
		if(!Music.player) {
			return false;
		}

		return !Music.player.playing;
	}
}

global.Music = Music;

Music.updateFilesList();