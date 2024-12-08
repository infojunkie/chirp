import {
  Playlist,
  Version,
  Converter
} from 'https://cdn.jsdelivr.net/npm/ireal-musicxml@2.0.4/+esm';
import JSZip from 'https://cdn.jsdelivr.net/npm/@progress/jszip-esm/+esm';
import pkg from './package.json' with { type: 'json' };

const BASE_URL = 'https://raw.githubusercontent.com/infojunkie/musicxml-mscx/refs/heads/main/';
const MSCX_SEF = 'build/mscx.sef.json';
const INSTRUMENTS_XML = 'src/instruments.xml';
const LEADSHEET_MSS = 'src/lead-sheet.mss';

const g_state = {
  stop: false,
  sheets: [],
}

async function populateSheets(ireal) {
  const playlist = new Playlist(ireal);
  const playlistName = playlist.name ?? 'ALL SONGS';
  const sheets = document.getElementById('sheets');
  const template = document.getElementById('sheets-template');
  const progress = document.getElementById('progress-bar');
  const groove = 'None';
  sheets.innerHTML = '';
  progress.style.width = 0;
  const zip = new JSZip();
  g_state.stop = false;

  // Create playlist entry at the top, initially empty.
  const first = template.content.cloneNode(true).querySelector('.sheet-item');
  first.querySelector('.sheet-title').textContent = playlistName;
  first.querySelector('.sheet-musescore').textContent = '';
  first.querySelector('.sheet-midi').textContent = '';
  sheets.appendChild(first);

  // Print the song title.
  g_state.sheets = Array.apply(null, Array(playlist.songs.length)).map(_ => new Object());
  for (const [n, song] of playlist.songs.entries()) {
    const item = template.content.cloneNode(true).querySelector('.sheet-item');
    item.querySelector('.sheet-title').textContent = song.title;
    item.dataset.index = n;
    sheets.appendChild(item);
  }

  // Generate the MusicXML file.
  for (const [n, song] of playlist.songs.entries()) {
    if (g_state.stop) break;

    try {
      const item = sheets.querySelector(`.sheet-item[data-index="${n}"]`);
      const filename = toFilename(song.title);
      const musicXml = Converter.convert(song, {
        notation: 'rhythmic',
        date: false,
      });
      g_state.sheets[n].filename = filename;
      g_state.sheets[n].musicXml = musicXml;
      zip.file(`${filename}.musicxml`, musicXml);
      const a = document.createElement('a');
      a.setAttribute('href', URL.createObjectURL(new Blob([musicXml], { type: 'text/xml' })));
      a.setAttribute('download', `${filename}.musicxml`);
      a.innerText = `MusicXML`;
      item.querySelector('.sheet-musicxml').textContent = '';
      item.querySelector('.sheet-musicxml').appendChild(a);
    }
    catch (error) {
      console.error(`Failed to convert ${song.title} to MusicXML: ${error}`);
      item.querySelector('.sheet-musicxml').textContent = '💥';
      item.querySelector('.sheet-musescore').textContent = '🛑';
      item.querySelector('.sheet-midi').textContent = '🛑';
    }

    const percentage = (n+1) * 100 / playlist.songs.length;
    progress.style.width = `${percentage}%`;
    progress.innerHTML = `MusicXML&nbsp;${Math.round(percentage)}%`;
    await yielder();
  }

  // Generate the MuseScore file.
  for (const [n, song] of playlist.songs.entries()) {
    if (g_state.stop) break;

    const item = sheets.querySelector(`.sheet-item[data-index="${n}"]`);
    const filename = g_state.sheets[n].filename;
    const musicXml = g_state.sheets[n].musicXml;

    if (musicXml) {
      try {
        const musescore = await SaxonJS.transform(
          {
            stylesheetLocation: BASE_URL + MSCX_SEF,
            sourceText: musicXml,
            destination: 'serialized',
            stylesheetParams: {
              instrumentsFile: BASE_URL + INSTRUMENTS_XML,
              styleFile: BASE_URL + LEADSHEET_MSS
            },
          },
          'async',
        );
        zip.file(`${filename}.mscx`, musescore.principalResult, { binary: false });
        const a = document.createElement('a');
        a.setAttribute('href', URL.createObjectURL(new Blob([musescore.principalResult], { type: 'text/xml' })));
        a.setAttribute('download', `${filename}.mscx`);
        a.innerText = `MuseScore`;
        item.querySelector('.sheet-musescore').textContent = '';
        item.querySelector('.sheet-musescore').appendChild(a);
      }
      catch (error) {
        console.error(`Failed to convert ${song.title} to MuseScore: ${error}`);
        item.querySelector('.sheet-musescore').textContent = '🛑';
      }
    }

    const percentage = (n+1) * 100 / playlist.songs.length;
    progress.style.width = `${percentage}%`;
    progress.innerHTML = `MuseScore&nbsp;${Math.round(percentage)}%`;
    await yielder();
  };

  // Generate the MIDI file.
  for (const [n, song] of playlist.songs.entries()) {
    if (g_state.stop) break;

    const item = sheets.querySelector(`.sheet-item[data-index="${n}"]`);
    const filename = g_state.sheets[n].filename;
    const musicXml = g_state.sheets[n].musicXml;

    if (musicXml) {
      try {
        const formData = new FormData();
        formData.append('musicXml', new Blob([musicXml], { type: 'text/xml' }), `${filename}.musicxml`);
        formData.append('globalGroove', groove);
        const response = await fetish(window.location.href + 'mma/convert', {
          method: 'POST',
          body: formData,
        });
        const midiBuffer = await response.arrayBuffer();
        zip.file(`${filename}.mid`, midiBuffer, { binary: true });
        const a = document.createElement('a');
        a.setAttribute('href', URL.createObjectURL(new Blob([midiBuffer], { type: 'audio/midi' })));
        a.setAttribute('download', `${filename}.mid`);
        a.innerText = `MIDI`;
        item.querySelector('.sheet-midi').textContent = '';
        item.querySelector('.sheet-midi').appendChild(a);
      }
      catch (error) {
        console.error(`Failed to convert ${song.title} to MIDI: ${error}`);
        item.querySelector('.sheet-midi').textContent = '🛑';
      }
    }

    const percentage = (n+1) * 100 / playlist.songs.length;
    progress.style.width = `${percentage}%`;
    progress.innerHTML = `MIDI&nbsp;${Math.round(percentage)}%`;
    await yielder();
  };

  // Add zip package to first entry.
  const filename = toFilename(playlistName);
  const a = document.createElement('a');
  a.setAttribute('href', URL.createObjectURL(await zip.generateAsync({type: 'blob'}, metadata => {
    progress.style.width = `${metadata.percent}%`;
    progress.innerHTML = `Zip&nbsp;${Math.round(metadata.percent)}%`;
  }), { type: 'application/zip' }));
  a.setAttribute('download', `${filename}.zip`);
  a.innerText = `Zip`;
  first.querySelector('.sheet-musicxml').textContent = '';
  first.querySelector('.sheet-musicxml').appendChild(a);
}

async function handleFileBuffer(buffer) {
  try {
    const ireal = new TextDecoder().decode(buffer);
    await populateSheets(ireal);
  }
  catch (error) {
    document.getElementById('error').textContent = 'This file is not recognized as an iReal Pro playlist.';
  }
}

async function handleFileUpload(e) {
  const reader = new FileReader();
  const file = e.target.files[0];
  reader.onloadend = async (upload) => {
    await handleFileBuffer(upload.target.result);
  };
  if (file.size < 1*1024*1024) {
    reader.readAsArrayBuffer(file);
  }
  else {
    document.getElementById('error').textContent = 'This file is too large.';
  }
}

async function handleIRealChange(e) {
  if (!e.target.value) return;
  try {
    await populateSheets(e.target.value);
  }
  catch (error) {
    console.error(`Failed to convert iReal Pro URI: ${error}`);
    document.getElementById('error').textContent = 'This URI is not recognized as an iReal Pro playlist.';
    document.getElementById('ireal').value = '';
  }
}

async function handleSampleSelect(e) {
  if (!e.target.value) return;
  const sample = e.target.value;
  try {
    const ireal = await (await fetish(sample)).text();
    await populateSheets(ireal);
  }
  catch (error) {
    console.error(`Failed to load iReal Pro playlist ${sample}: ${error}`);
  }
}

function handleStopButton() {
  g_state.stop = true;
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
});

/**
 * Generate a filename.
 */
function toFilename(title) {
  return title.toLowerCase().replace(/[/\\?%*:|"'<>\s]/g, '-');
}

/**
 * Fetch wrapper to throw an error if the response is not ok.
 */
async function fetish(input, init) {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(response.statusText);
  return response;
}

/**
 * Yield to browser.
 * https://stackoverflow.com/a/64814589/209184
 */
const yielder = () => new Promise((resolve) => setTimeout(() => resolve(), 0))
