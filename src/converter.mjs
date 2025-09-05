import {
  Playlist,
  Converter
} from 'https://cdn.jsdelivr.net/npm/@music-i18n/ireal-musicxml@latest/+esm';
import JSZip from 'https://cdn.jsdelivr.net/npm/@progress/jszip-esm/+esm';
import { toFilename, fetish, yielder } from './utils.mjs';

const g_state = {
  playlist: null,
  zipper: null
}

/**
 * Listen for messages from the main thread.
 */
addEventListener('message', async (message) => {
  if (message.data.command === 'convert') {
    convertPlaylist(message.data.ireal, message.data.options);
  }
  if (message.data.command === 'musescore') {
    g_state.zipper.file(`${message.data.filename}.mscx`, message.data.musescore, { binary: false });
    if (message.data.index+1 === g_state.playlist.songs.length) {
      generateZip();
    }
  }
});

/**
 * Convert iReal Pro playlist.
 */
async function convertPlaylist(ireal, options) {
  // Initialize conversion.
  try {
    g_state.playlist = new Playlist(ireal);
    g_state.playlist.name ??= 'ALL SONGS';
    g_state.zipper = new JSZip();
  }
  catch (error) {
    self.postMessage({ status: 'error', error: options.error });
    console.error(error);
    return;
  }
  self.postMessage({ status: 'starting', playlist: g_state.playlist });

  // Loop on all songs.
  for (const [index, song] of g_state.playlist.songs.entries()) {
    // Conversion information.
    const conversion = {
      index,
      total: g_state.playlist.songs.length,
      filename: toFilename(song.title),
      source: null,
      musicxml: null,
      musescore: null,
      midi: null,
      midiBuffer: null
    }

    // Generate the MusicXML file.
    try {
      conversion.source = Converter.convert(song, {
        notation: 'rhythmic',
        date: false,
      });
      g_state.zipper.file(`${conversion.filename}.musicxml`, conversion.source, { binary: false });
      conversion.musicxml = URL.createObjectURL(new Blob([conversion.source], { type: 'text/xml' }));
    }
    catch (error) {
      console.error(`Failed to convert ${song.title} to MusicXML: ${error}`);
    }

    // Generate the MIDI file.
    if (conversion.source) {
      try {
        const formData = new FormData();
        formData.append('musicXml', new Blob([conversion.source], { type: 'text/xml' }), `${conversion.filename}.musicxml`);
        formData.append('globalGroove', 'None');
        const response = await fetish(options.href + 'mma/convert', {
          method: 'POST',
          body: formData,
        });
        const midiBuffer = await response.arrayBuffer();
        g_state.zipper.file(`${conversion.filename}.mid`, midiBuffer, { binary: true });
        conversion.midi = URL.createObjectURL(new Blob([midiBuffer], { type: 'audio/midi' }));
        conversion.midiBuffer = midiBuffer;
      }
      catch (error) {
        console.error(`Failed to convert ${song.title} to MIDI: ${error}`);
      }
    }

    // Update UI thread.
    self.postMessage({ status: 'converting', song, conversion });
    await yielder();
  }
}

/**
 * Generate zip file.
 */
async function generateZip() {
  const filename = toFilename(g_state.playlist.name);
  let percent = -1;
  const zip = URL.createObjectURL(await g_state.zipper.generateAsync({ type: 'blob' }, metadata => {
    if (Math.round(metadata.percent) != percent) {
      percent = Math.round(metadata.percent);
      self.postMessage({ status: 'zipping', percent: percent });
    }
  }), { type: 'application/zip' });
  self.postMessage({ status: 'done', zip, filename });
}
