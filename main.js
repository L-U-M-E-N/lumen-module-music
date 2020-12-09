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

		if(Music.mutex) {
			return;
		}

		console.log('Playing ', filePath);
		try {
			if (fs.existsSync(filePath)) {
				Music.mutex = true;
				await Music._stop();

				Music.player = new Audic(filePath);
				await Music.player.play();

				Music.mutex = false;

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

	static async _notifyClient() {
		if(!window.getFocusedWindow()) { return; }
		window.getFocusedWindow().webContents.send('listsUpdated', {});
	}

	static async _stop() {
		if(Music.player) {
			await Music.player.destroy();
			Music.player = null;
		}

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
				Music._shufflePlaylist();
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
				Music._notifyClient();
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

	static getPlaylist() {
		return playlist;
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