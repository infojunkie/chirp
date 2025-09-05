import { Version } from 'https://cdn.jsdelivr.net/npm/@music-i18n/ireal-musicxml@latest/+esm';
import pkg from '../package.json' with { type: 'json' };
import { WorkletSynthesizer as Synthetizer, Sequencer } from 'https://cdn.jsdelivr.net/npm/spessasynth_lib@latest/+esm';
import { fetish } from './utils.mjs';

const BASE_URL = 'https://raw.githubusercontent.com/infojunkie/musicxml-mscx/refs/heads/main/';
const MSCX_SEF = 'build/mscx.sef.json';
const INSTRUMENTS_XML = 'src/instruments.xml';
const LEADSHEET_MSS = 'src/lead-sheet.mss';

const g_state = {
  context: new AudioContext(),
  synthesizer: null,
  sequencer: null,
  converter: null
}

function populateSheets(ireal, possibleErrorMessage) {
  g_state.converter.postMessage({ command: 'convert', ireal, options: {
    href: window.location.href,
    error: possibleErrorMessage,
  }});
}

function handleWorkerMessage(event) {
  const sheets = document.getElementById('sheets');
  const template = document.getElementById('sheets-template');
  const progress = document.getElementById('progress-bar');
  const error = document.getElementById('error');
  const message = event.data;

  switch (message.status) {
    case 'error': {
      error.textContent = message.error;
      document.getElementById('upload').value = '';
      document.getElementById('samples').value = '';
      document.getElementById('ireal').value = '';
      break;
    }
    case 'starting': {
      // Initialize the list.
      sheets.innerHTML = '';
      progress.style.width = 0;
      error.textContent = '';

      // Create playlist entry at the top, initially empty.
      const first = template.content.cloneNode(true).querySelector('.sheet-item');
      first.querySelector('.sheet-title').textContent = message.playlist.name;
      first.querySelector('.sheet-musescore').textContent = '';
      first.querySelector('.sheet-midi').textContent = '';
      first.dataset.index = 'first';
      sheets.appendChild(first);

      // Print song titles.
      for (const [index, song] of message.playlist.songs.entries()) {
        const item = template.content.cloneNode(true).querySelector('.sheet-item');
        item.querySelector('.sheet-title').textContent = song.title;
        item.dataset.index = index;
        sheets.appendChild(item);
      }
      break;
    }
    case 'aborted': {
      progress.innerHTML = '';
      progress.style.width = 0;
      break;
    }
    case 'converting': {
      const item = sheets.querySelector(`.sheet-item[data-index="${message.conversion.index}"]`);

      // Convert to MuseScore here because SaxonJS does not work in Web Workers :-(
      try {
        const musescore = SaxonJS.transform(
          {
            stylesheetLocation: BASE_URL + MSCX_SEF,
            sourceText: message.conversion.source,
            destination: 'serialized',
            stylesheetParams: {
              instrumentsFile: BASE_URL + INSTRUMENTS_XML,
              styleFile: BASE_URL + LEADSHEET_MSS
            },
          },
          'sync',
        );
        message.conversion.musescore = URL.createObjectURL(new Blob([musescore.principalResult], { type: 'text/xml' }));
        g_state.converter.postMessage({
          command: 'musescore',
          musescore: musescore.principalResult,
          filename: message.conversion.filename,
          index: message.conversion.index
        });
      }
      catch (error) {
        console.error(`Failed to convert ${message.song.title} to MuseScore: ${error}`);
      }

      // MusicXML link.
      if (!message.conversion.musicxml) {
        item.querySelector('.sheet-musicxml').textContent = '💥';
        item.querySelector('.sheet-musescore').textContent = '🛑';
        item.querySelector('.sheet-midi').textContent = '🛑';
        break;
      }
      const musicxml = document.createElement('a');
      musicxml.setAttribute('href', message.conversion.musicxml);
      musicxml.setAttribute('download', `${message.conversion.filename}.musicxml`);
      musicxml.innerText = `MusicXML`;
      item.querySelector('.sheet-musicxml').textContent = '';
      item.querySelector('.sheet-musicxml').appendChild(musicxml);

      // MuseScore link.
      if (!message.conversion.musescore) {
        item.querySelector('.sheet-musescore').textContent = '💥';
      }
      else {
        const musescore = document.createElement('a');
        musescore.setAttribute('href', message.conversion.musescore);
        musescore.setAttribute('download', `${message.conversion.filename}.mscx`);
        musescore.innerText = `MuseScore`;
        item.querySelector('.sheet-musescore').textContent = '';
        item.querySelector('.sheet-musescore').appendChild(musescore);
      }

      // MIDI link.
      if (!message.conversion.midi) {
        item.querySelector('.sheet-midi').textContent = '💥';
      }
      else {
        const midi = document.createElement('a');
        midi.setAttribute('href', message.conversion.midi);
        midi.setAttribute('download', `${message.conversion.filename}.mid`);
        midi.innerText = `MIDI`;
        item.querySelector('.sheet-midi').textContent = '';
        item.querySelector('.sheet-midi').appendChild(midi);
        item.querySelector('.sheet-play').addEventListener('click', function() {
          // Reset other playing items.
          sheets.querySelectorAll('.sheet-item:not(:first-child) .sheet-play.hide:not(.inactive)').forEach(play => {
            play.classList.remove('hide');
            play.parentNode.querySelector('.sheet-stop').classList.add('hide');
          });
          this.classList.add('hide');
          item.querySelector('.sheet-stop').classList.remove('hide');
          g_state.context.resume();
          g_state.sequencer = new Sequencer(g_state.synthesizer);
          g_state.sequencer.loadNewSongList([{ binary: message.conversion.midiBuffer }]);
          g_state.sequencer.play();
        });
        item.querySelector('.sheet-stop').addEventListener('click', function() {
          g_state.sequencer.pause();
          this.classList.add('hide');
          item.querySelector('.sheet-play:not(.inactive)').classList.remove('hide');
        });
        item.querySelector('.sheet-play').classList.remove('hide', 'inactive');
      }

      // Progress bar.
      const percentage = (message.conversion.index + 1) * 100 / message.conversion.total;
      progress.style.width = `${percentage}%`;
      progress.innerHTML = `${Math.round(percentage)}%`;
      break;
    }
    case 'zipping': {
      progress.style.width = `${message.percent}%`;
      progress.innerHTML = `${Math.round(message.percent)}%`;
    }
    case 'done': {
      const first = sheets.querySelector(`.sheet-item[data-index="first"]`);
      const zip = document.createElement('a');
      zip.setAttribute('href', message.zip);
      zip.setAttribute('download', `${message.filename}.zip`);
      zip.innerText = `ZIP`;
      first.querySelector('.sheet-musicxml').textContent = '';
      first.querySelector('.sheet-musicxml').appendChild(zip);
      break;
    }
    default:
      console.error(`Unknown worker status ${message.status}. Ignoring.`);
  }
}

function handleFileUpload(e) {
  const reader = new FileReader();
  const file = e.target.files[0];
  reader.onloadend = async (upload) => {
    populateSheets(new TextDecoder().decode(upload.target.result), 'This file is not recognized as an iReal Pro playlist.');
    document.getElementById('samples').value = '';
    document.getElementById('ireal').value = '';
  };
  if (file.size < 1*1024*1024) {
    reader.readAsArrayBuffer(file);
  }
  else {
    handleWorkerMessage({ data: { status: 'error', error: 'This file is too large.' }});
  }
}

function handleIRealChange(e) {
  if (!e.target.value) return;
  populateSheets(e.target.value, 'This URI is not recognized as an iReal Pro playlist.');
  document.getElementById('upload').value = '';
  document.getElementById('samples').value = '';
}

async function handleSampleSelect(e) {
  if (!e.target.value) return;
  const sample = e.target.value;
  try {
    populateSheets(await (await fetish(sample)).text(), 'This sample is not recognized as an iReal Pro playlist.');
    document.getElementById('upload').value = '';
    document.getElementById('ireal').value = '';
  }
  catch (error) {
    handleWorkerMessage({ data: { status: 'error', error: 'An error occurred while retrieving the iReal Pro sample.' }});
    console.error(error);
  }
}

function handleStopButton() {
  g_state.converter.terminate();
  handleWorkerMessage({ data: { status: 'aborted' }});
  g_state.converter = new Worker(new URL('converter.mjs', import.meta.url), { type: 'module' });
  g_state.converter.addEventListener('message', handleWorkerMessage);
}

function handleEscKey(e) {
  if (e.keyCode === 27) {
    e.preventDefault();
    handleStopButton();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('upload').addEventListener('change', handleFileUpload);
  document.getElementById('samples').addEventListener('change', handleSampleSelect);
  document.getElementById('ireal').addEventListener('change', handleIRealChange);
  document.getElementById('stop').addEventListener('click', handleStopButton);
  window.addEventListener('keydown', handleEscKey, true);
  const mmaVersion = await (await fetish(window.location.href + 'mma/')).json();
  document.getElementById('version').textContent = JSON.stringify({
    'app': `${pkg.name} v${pkg.version}`,
    'musicxml': `${Version.name} v${Version.version}`,
    'midi': `${mmaVersion.name} v${mmaVersion.version}`
  });

  // Init MIDI synthesizer.
  await g_state.context.audioWorklet.addModule('data/spessasynth_processor.min.js');
  const soundfont = await (await fetch('data/GeneralUserGS.sf3')).arrayBuffer();
  g_state.synthesizer = new Synthetizer(g_state.context);
  g_state.synthesizer.connect(g_state.context.destination);
  await g_state.synthesizer.soundBankManager.addSoundBank(soundfont, 'main');

  // Init worker.
  g_state.converter = new Worker(new URL('converter.mjs', import.meta.url), { type: 'module' });
  g_state.converter.addEventListener('message', handleWorkerMessage);
});
