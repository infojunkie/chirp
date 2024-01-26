import iRealMusicXML from 'https://cdn.jsdelivr.net/npm/ireal-musicxml/+esm';

async function populateSheets(ireal) {
  const playlist = new iRealMusicXML.Playlist(ireal);
  const sheets = document.getElementById('sheets');
  const template = document.getElementById('sheets-template');
  const progress = document.getElementById('progress-bar');
  sheets.innerHTML = '';
  progress.style.width = 0;
  for (const [n, song] of playlist.songs.entries()) {
    const item = template.content.cloneNode(true).querySelector('.sheet-item');
    // Song title.
    item.querySelector('.sheet-title').textContent = song.title;
    // MusicXML file.
    const filename = song.title.toLowerCase().replace(/[/\\?%*:|"'<>\s]/g, '-');
    const musicXml = iRealMusicXML.MusicXML.convert(song, {
      notation: 'rhythmic'
    });
    const a1 = document.createElement('a');
    a1.setAttribute('href', 'data:text/xml;charset=utf-8,' + encodeURIComponent(musicXml));
    a1.setAttribute('download', `${filename}.musicxml`);
    a1.innerText = `${filename}.musicxml`;
    item.querySelector('.sheet-musicxml').appendChild(a1);
    // MIDI file.
    const formData = new FormData();
    formData.append('musicXml', new Blob([musicXml], { type: 'text/xml' }));
    formData.append('globalGroove', 'None');
    const response = await fetish(window.location.href + 'mma/convert', {
      method: 'POST',
      body: formData,
    });
    const a2 = document.createElement('a');
    a2.setAttribute('href', URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: 'audio/midi' })));
    a2.setAttribute('download', `${filename}.mid`);
    a2.innerText = `${filename}.mid`;
    item.querySelector('.sheet-midi').appendChild(a2);
    // Show the song.
    sheets.appendChild(item);
    progress.style.width = ((n+1) * 100 / playlist.songs.length) + '%';
    await yielder();
  };
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
  catch {
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

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('upload').addEventListener('change', handleFileUpload);
  document.getElementById('samples').addEventListener('change', handleSampleSelect);
  document.getElementById('ireal').addEventListener('change', handleIRealChange);
});

/**
 * Fetch wrapper to throw an error if the response is not ok.
 * Why indeed? https://github.com/whatwg/fetch/issues/18
 */
async function fetish(
  input,
  init,
) {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(response.statusText);
  return response;
}

/**
 * Yield to browser.
 * https://stackoverflow.com/a/64814589/209184
 */
const yielder = () => new Promise((resolve) => setTimeout(() => resolve(), 0))
