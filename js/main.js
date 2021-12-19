let localMusicData = {};

class Music {
	/**
	 * Load
	 */
	static async init() {
		if(await AppDataManager.exists('music', 'localMusicData')) {
			localMusicData = await AppDataManager.loadObject('music', 'localMusicData');
		}

		if(typeof localMusicData.audioVolume === 'undefined') {
			localMusicData.audioVolume = 50;
		}
		Music.updateVolume();

		if(!localMusicData.musicScores) {
			localMusicData.musicScores = {};
		}

		if(currentWindow === 'index') {
			await Music.initIndexModule();

		} else if(currentWindow === 'music') {
			await Music.initMusicPage();
		}
	}

	static async initIndexModule() {
		await Music.drawMusicStatus();

		ipcRenderer.on('Music-listsUpdated', async function() {
			await Music.drawMusicStatus();
			await Music.drawPlayPause();
		});

		// Volume
		Music.updateVolume();
		document.querySelector('#module-music-incVol').addEventListener('click', Music.increaseVolume);
		document.querySelector('#module-music-decVol').addEventListener('click', Music.decreaseVolume);

		// Next/Prev
		document.querySelector('#module-music-prev').addEventListener('click', Music.prevMusic);
		document.querySelector('#module-music-next').addEventListener('click', Music.nextMusic);

		// Play/Pause
		document.querySelector('#module-music-playPause').addEventListener('click', Music.togglePlayPause);

		// Open window
		document.getElementById('module-music-more').addEventListener('click', function() {
			document.getElementById('music').click();
		});

		// Auto mode
		document.querySelector('#module-music-auto').addEventListener('click', Music.randomPlayList);

		// Clavier
		document.addEventListener('keydown', async function(e) {
			switch(e.which) {
				case 32: // Play/Pause
					await Music.togglePlayPause();
					break;
				case 39: // Next music ( Right Arrow )
					await Music.nextMusic();
					break;
				case 37: // Prev music ( Left Arrow )
					await Music.prevMusic();
					break;
				case 38: // Up volume ( Up Arrow )
					Music.increaseVolume();
					break;
				case 40: // Down volume ( Down Arrow )
					Music.decreaseVolume();
					break;
				default:
				// Do nothing
			}
		});

		// Mise a jour du temps
		setInterval(Music.drawMusicStatus, 1000);
	}

	static async initMusicPage() {
		await Music.regenerateAlbumList();

		ipcRenderer.on('Music-listsUpdated', async function() {
			await Music.regenerateAlbumList();
			await Music.drawPlaylist();
		});

		if(await ipcRenderer.invoke('Music-isPlaylistRandom')) {
			document.querySelector('#playlist-random')
				.style.color = 'red';
		}

		// Clavier
		document.addEventListener('keydown', function(e) {
			switch(e.which) {
				case 27: // Hide album details
					Music.hideAlbum(e);
					break;
				default:
				// Do nothing
			}
		});

		document.querySelector('#playlist-refresh').addEventListener('click', Music.refreshList);
		document.querySelector('#playlist-random').addEventListener('click', Music.toggleRandom);
		document.querySelector('#playlist-clear').addEventListener('click', ipcRenderer.send('Music-clearPlayList'));
		document.querySelector('#album-details').addEventListener('contextmenu', Music.hideAlbum);
		document.querySelector('#album-details-close').addEventListener('click', Music.hideAlbum);

		await Music.drawPlaylist();
	}

	static refreshList() {
		ipcRenderer.send('Music-updateFilesList');
	}

	/**
	 * Module on main window
	 */
	static async applyMusicChange() {
		// TODO: Migrate to server side that method

		const currentPath = await ipcRenderer.invoke('Music-getCurrentMusicPath');
		const duration = await ipcRenderer.invoke('Music-getDuration');

		if(
			currentPath === '' ||
			Number.isNaN(duration)
		) {
			return;
		}

		if(!localMusicData.musicScores[currentPath]) {
			localMusicData.musicScores[currentPath] = {
				count: 0,
				scoreSum: 0
			};
		}

		const currentTime = await ipcRenderer.invoke('Music-getCurrentTime');

		localMusicData.musicScores[currentPath].count = parseInt(localMusicData.musicScores[currentPath].count) + 1;
		localMusicData.musicScores[currentPath].scoreSum = parseInt(localMusicData.musicScores[currentPath].scoreSum) + (currentTime / duration);

		await AppDataManager.saveObject('music', 'localMusicData', localMusicData);
	}

	static async updateVolume() {
		ipcRenderer.send('Music-setVolume', localMusicData.audioVolume / 100);

		const volDOM = document.querySelector('#module-music-volume');
		if(volDOM) {
			volDOM.innerText = localMusicData.audioVolume + '%';
		}
		await AppDataManager.saveObject('music', 'localMusicData', localMusicData);
	}

	static async increaseVolume() {
		if(localMusicData.audioVolume >= 100) { return; }

		localMusicData.audioVolume += 2;
		await Music.updateVolume();
	}

	static async decreaseVolume() {
		if(localMusicData.audioVolume <= 0) { return; }

		localMusicData.audioVolume -= 2;
		await Music.updateVolume();
	}

	static async prevMusic() {
		await Music.applyMusicChange();
		ipcRenderer.send('Music-playPrevMusic');
	}

	static async nextMusic() {
		await Music.applyMusicChange();
		ipcRenderer.send('Music-playNextMusic');
	}

	static async togglePlayPause() {
		ipcRenderer.send('Music-togglePlayPause');

		await Music.drawPlayPause();
	}

	static async drawMusicStatus(checkPaused=true) {
		if(checkPaused && await ipcRenderer.invoke('Music-paused')) { return; }

		if(await ipcRenderer.invoke('Music-playlistSrc').length === 0) {
			document.querySelector('#module-music-title').innerText = 'Empty playlist'; // @TODO: locales
			document.querySelector('#module-music-time').innerText = '0:00/0:00';
			await Music.drawPlayPause();
			return;
		}

		const currentTime = await ipcRenderer.invoke('Music-getCurrentTime');
		const duration = await ipcRenderer.invoke('Music-getDuration');

		let secCurr = parseInt(('' + currentTime).split('.')[0])%60;
		if(secCurr < 10) { secCurr = '0' + secCurr; }

		let secDuration = parseInt(('' + duration).split('.')[0])%60;
		if(secDuration < 10) { secDuration = '0' + secDuration; }

		document.querySelector('#module-music-time')
			.innerText = Math.floor(currentTime/60) + ':' + secCurr +
				'/' + Math.floor(duration/60) + ':' + secDuration;

		document.querySelector('#module-music-title').innerText = await ipcRenderer.invoke('Music-getCurrentMusicTitle');
	}

	static async drawPlayPause() {
		if(await ipcRenderer.invoke('Music-paused')) {
			document.querySelector('#module-music-playPause')
				.innerHTML = '▶';
		} else {
			document.querySelector('#module-music-playPause')
				.innerHTML = '&#10074;&#10074;';
		}
	}

	/**
	 * Music window
	 */
	static async drawPlaylist() {
		if(!document.querySelector('#music-list')) { return; }

		let playlistHTML = '';

		const playlist = await ipcRenderer.invoke('Music-playlist');
		const currentPath = await ipcRenderer.invoke('Music-getCurrentMusicPath');
		for(let i=0; i < playlist.length; i++) {
			if(playlist[i] === currentPath) {
				playlistHTML += '<li id="' + i + '"><b>' + playlist[i] + '</b></li>';
			} else {
				playlistHTML += '<li  id="' + i + '">' + playlist[i] + '</li>';
			}
		}

		document.querySelector('#music-list').innerHTML = playlistHTML;

		const musicsInPlaylist = document.querySelectorAll('#music-list li');
		for(let m=0; m<musicsInPlaylist.length; m++) {
			musicsInPlaylist[m].addEventListener('click', function() {
				const currId = parseInt(this.id);
				ipcRenderer.send('Music-chooseMusic', currId);
			});

			musicsInPlaylist[m].addEventListener('contextmenu', function() {
				if(Date.now() - lastRemove < 150) { return; }
				lastRemove = Date.now();

				const currId = parseInt(this.id);
				ipcRenderer.send('Music-removeFromPlayList', currId);
			});
		}
	}

	static async drawAlbum(albumID) {
		let content = '';

		// Generer texte
		const musicList = await ipcRenderer.invoke('Music-musicList');
		for(let i=0; i< musicList[albumID].length; i++) {
			content += '<li class="album-details-music" albumid="' + albumID +'" musicid="' + i +'">' + musicList[albumID][i] + '</li>';
		}

		document.querySelector('#album-details').innerHTML = content;

		const musicsDOM = document.querySelectorAll('.album-details-music');
		for(let m=0; m<musicsDOM.length; m++) {
			musicsDOM[m].addEventListener('click', function(e) {
				ipcRenderer.send('Music-addMusic', this.getAttribute('albumid'), this.getAttribute('musicid'));
			});
		}

		//Hide & show
		document.querySelector('#album-details').style.display = 'block';
		document.querySelector('#album-details-close').style.display = 'block';
		document.querySelector('#albumlist').style.display = 'none';
	}

	static hideAlbum(e) {
		document.querySelector('#album-details').style.display = 'none';
		document.querySelector('#album-details-close').style.display = 'none';
		document.querySelector('#albumlist').style.display = 'block';

		e.preventDefault();
	}

	static async toggleRandom() {
		await ipcRenderer.invoke('Music-toggleRandom');

		const playlistRandom = await ipcRenderer.invoke('Music-isPlaylistRandom');
		if(playlistRandom) {
			document.querySelector('#playlist-random')
				.style.color = 'red';
		} else {
			document.querySelector('#playlist-random')
				.style.color = 'white';
		}

		await Music.drawPlaylist();
	}

	static async regenerateAlbumList() {
		let albumHTML = '';
		const albums = [];

		for(const i in await ipcRenderer.invoke('Music-musicList')) {
			albums.push(i);
		}

		const directories = await ConfigManager.get('music', 'directories');

		albums.sort((a,b) => {
			if(directories.includes(a)) { return -1; }

			let albumA = a.split('/');
			albumA = albumA[albumA.length - 1];

			let albumB = b.split('/');
			albumB = albumB[albumB.length - 1];

			if(albumA > albumB) {
				return 1;
			} else if(albumA < albumB) {
				return -1;
			}

			return 0;
		});

		for(const i of albums) {
			let albumName = i.split('/');
			albumName = albumName[albumName.length - 1];
			if(albumName === undefined) { albumName = 'noimage'; }

			const directory = directories[0]; // TODO: support multiple folders here
			albumHTML += '<div class="tile" id="' + i +
				'" style="background-image: url(\'' + directory + '/_icons/' + albumName +'.jpg\');">' +
				'<span class="add-album">+</span></div>';
		}

		document.querySelector('#albumlist').innerHTML = albumHTML;

		const albumsDOM = document.querySelectorAll('.tile');
		for(let a=0; a<albumsDOM.length; a++) {
			albumsDOM[a].addEventListener('click', async function(e) {

				if(e.target.classList.contains('add-album')) {
					// Add an album
					ipcRenderer.send('Music-addAlbum', this.id);
				} else {
					// Show an album details
					await Music.drawAlbum(this.id);
				}
			});
		}
	}

	static randomPlayList() {
		ipcRenderer.send('Music-clearPlayList');

		if(!localMusicData.musicScores) {
			localMusicData.musicScores = {};
		}

		ipcRenderer.send('Music-generatePlaylistFromMostLiked', localMusicData.musicScores, 200, 5);
	}
}
window.addEventListener('load', Music.init);