const ipcRenderer = require('electron').ipcRenderer;

let MusicPlayer;
let localMusicData = {};

class Music {
	/**
	 * Load
	 */
	static init() {
		MusicPlayer = remote.getGlobal('Music');

		if(AppDataManager.exists('music', 'localMusicData')) {
			localMusicData = AppDataManager.loadObject('music', 'localMusicData');
		}

		if(typeof localMusicData.audioVolume === 'undefined') {
			localMusicData.audioVolume = 50;
		}
		MusicPlayer.setVolume(localMusicData.audioVolume / 100)

		if(!localMusicData.musicScores) {
			localMusicData.musicScores = {};
		}

		if(currentWindow === 'index') {
			Music.initIndexModule();

		} else if(currentWindow === 'music') {
			Music.initMusicPage();
		}
	}

	static initIndexModule() {
		Music.drawMusicStatus();

		ipcRenderer.on('listsUpdated', function() {
			Music.drawMusicStatus();
			Music.drawPlayPause();
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
		document.addEventListener('keydown', function(e) {
			switch(e.which) {
				case 32: // Play/Pause
					Music.togglePlayPause();
					break;
				case 39: // Next music ( Right Arrow )
					Music.nextMusic();
					break;
				case 37: // Prev music ( Left Arrow )
					Music.prevMusic();
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

	static initMusicPage() {
		Music.regenerateAlbumList();

		ipcRenderer.on('listsUpdated', function() {
			Music.regenerateAlbumList();
			Music.drawPlaylist();
		});

		if(MusicPlayer.isPlaylistRandom()) {
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
		document.querySelector('#playlist-clear').addEventListener('click', MusicPlayer.clearPlayList);
		document.querySelector('#album-details').addEventListener('contextmenu', Music.hideAlbum);
		document.querySelector('#album-details-close').addEventListener('click', Music.hideAlbum);

		Music.drawPlaylist();
	}

	static refreshList() {
		MusicPlayer.updateFilesList();
	}

	/**
	 * Module on main window
	 */
	static applyMusicChange() {
		// TODO: Migrate to server side that method

		if(
			MusicPlayer.getCurrentMusicPath() === '' ||
			Number.isNaN(MusicPlayer.getDuration())
		) {
			return;
		}

		if(!localMusicData.musicScores[MusicPlayer.getCurrentMusicPath()]) {
			localMusicData.musicScores[MusicPlayer.getCurrentMusicPath()] = {
				count: 0,
				scoreSum: 0
			};
		}

		localMusicData.musicScores[MusicPlayer.getCurrentMusicPath()].count = parseInt(localMusicData.musicScores[MusicPlayer.getCurrentMusicPath()].count) + 1;
		localMusicData.musicScores[MusicPlayer.getCurrentMusicPath()].scoreSum = parseInt(localMusicData.musicScores[MusicPlayer.getCurrentMusicPath()].scoreSum) + (MusicPlayer.getCurrentTime() / MusicPlayer.getDuration());

		AppDataManager.saveObject('music', 'localMusicData', localMusicData);
	}

	static updateVolume() {
		MusicPlayer.setVolume(localMusicData.audioVolume / 100);
		document.querySelector('#module-music-volume')
			.innerText = localMusicData.audioVolume + '%';
		AppDataManager.saveObject('music', 'localMusicData', localMusicData);
	}

	static increaseVolume() {
		if(localMusicData.audioVolume >= 100) { return; }

		localMusicData.audioVolume += 2;
		Music.updateVolume();
	}

	static decreaseVolume() {
		if(localMusicData.audioVolume <= 0) { return; }

		localMusicData.audioVolume -= 2;
		Music.updateVolume();
	}

	static prevMusic() {
		MusicPlayer.playPrevMusic();
		Music.applyMusicChange();
	}

	static nextMusic() {
		MusicPlayer.playNextMusic();
		Music.applyMusicChange();
	}

	static togglePlayPause() {
		if(MusicPlayer.paused()) {
			MusicPlayer.play();
		} else {
			MusicPlayer.pause();
		}

		Music.drawPlayPause();
	}

	static drawMusicStatus(checkPaused=true) {
		if(checkPaused && MusicPlayer.paused()) { return; }

		if(remote.getGlobal('playlistSrc').length === 0) {
			document.querySelector('#module-music-title').innerText = 'Empty playlist'; // @TODO: locales
			document.querySelector('#module-music-time').innerText = '0:00/0:00';
			Music.drawPlayPause();
			return;
		}

		let secCurr = parseInt(('' + MusicPlayer.getCurrentTime()).split('.')[0])%60;
		if(secCurr < 10) { secCurr = '0' + secCurr; }

		let secDuration = parseInt(('' + MusicPlayer.getDuration()).split('.')[0])%60;
		if(secDuration < 10) { secDuration = '0' + secDuration; }

		document.querySelector('#module-music-time')
			.innerText = Math.floor(MusicPlayer.getCurrentTime()/60) + ':' + secCurr +
				'/' + Math.floor(MusicPlayer.getDuration()/60) + ':' + secDuration;

		document.querySelector('#module-music-title').innerText = MusicPlayer.getCurrentMusicTitle();
	}

	static drawPlayPause() {
		if(MusicPlayer.paused()) {
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
	static drawPlaylist() {
		if(!document.querySelector('#music-list')) { return; }

		let playlistHTML = '';

		const playlist = MusicPlayer.getPlaylist();
		for(let i=0; i < playlist.length; i++) {
			if(playlist[i] === MusicPlayer.getCurrentMusicPath()) {
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
				MusicPlayer.chooseMusic(currId);
			});

			musicsInPlaylist[m].addEventListener('contextmenu', function() {
				if(Date.now() - lastRemove < 150) { return; }
				lastRemove = Date.now();

				const currId = parseInt(this.id);
				MusicPlayer.removeFromPlayList(currId);
			});
		}
	}

	static drawAlbum(albumID) {
		let content = '';

		// Generer texte
		for(let i=0; i<remote.getGlobal('musicList')[albumID].length; i++) {
			content += '<li class="album-details-music" albumid="' + albumID +'" musicid="' + i +'">' + remote.getGlobal('musicList')[albumID][i] + '</li>';
		}

		document.querySelector('#album-details').innerHTML = content;

		const musicsDOM = document.querySelectorAll('.album-details-music');
		for(let m=0; m<musicsDOM.length; m++) {
			musicsDOM[m].addEventListener('click', function(e) {
				MusicPlayer.addMusic(this.getAttribute('albumid'), this.getAttribute('musicid'));
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

	static toggleRandom() {
		// TODO: Migrate to server side that method
		playlistRandom = !MusicPlayer.isPlaylistRandom();
		if(playlistRandom) {
			MusicPlayer._shufflePlaylist();
			document.querySelector('#playlist-random')
				.style.color = 'red';
		} else {
			playlistCurrent = remote.getGlobal('playlistCurrent');
			for(let i=0; i<orderedPlaylistSrc.length; i++) {
				if(orderedPlaylistSrc[i] === playlistSrc[playlistCurrent]) {
					playlistCurrent = i;
					break;
				}
			}

			playlist    = orderedPlaylist.slice();
			playlistSrc = orderedPlaylistSrc.slice();

			document.querySelector('#playlist-random')
				.style.color = 'white';
		}

		Music.updateVarsToMain();
		Music.drawPlaylist();
		ipcRenderer.send('updateRandom', playlistRandom);
	}

	static regenerateAlbumList() {
		let albumHTML = '';
		const albums = [];

		for(const i in remote.getGlobal('musicList')) {
			albums.push(i);
		}

		albums.sort((a,b) => {
			if(a === 'G:/Musique') { return -1; }

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

			albumHTML += '<div class="tile" id="' + i +
				'" style="background-image: url(\'G:/Musique/_icons/' + albumName +'.jpg\');">' +
				'<span class="add-album">+</span></div>';
		}

		document.querySelector('#albumlist').innerHTML = albumHTML;

		const albumsDOM = document.querySelectorAll('.tile');
		for(let a=0; a<albumsDOM.length; a++) {
			albumsDOM[a].addEventListener('click', function(e) {

				if(e.target.classList.contains('add-album')) {
					// Add an album
					MusicPlayer.addAlbum(this.id);
				} else {
					// Show an album details
					Music.drawAlbum(this.id);
				}
			});
		}
	}

	static randomPlayList() {
		MusicPlayer.clearPlayList();

		if(!localMusicData.musicScores) {
			localMusicData.musicScores = {};
		}

		MusicPlayer.generatePlaylistFromMostLiked(localMusicData.musicScores, 200, 5);
	}
}
window.addEventListener('load', Music.init);