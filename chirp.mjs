import iRealMusicXML from 'https://cdn.jsdelivr.net/npm/ireal-musicxml/+esm';

async function populateSheets(ireal) {
  const playlist = new iRealMusicXML.Playlist(ireal);
  const sheets = document.getElementById('sheets');
  const template = document.getElementById('sheets-template');
  const progress = document.getElementById('progress-bar');
  sheets.innerHTML = '';
  progress.style.width = 0;
  for (const [n, song] of playlist.songs.entries()) {
    const div = template.content.cloneNode(true).querySelector('.sheet-item');
    div.querySelector('.sheet-title').textContent = song.title;
    const filename = song.title.toLowerCase().replace(/[/\\?%*:|"'<>\s]/g, '-');
    const musicXml = iRealMusicXML.MusicXML.convert(song, {
      notation: 'rhythmic'
    });
    const a = document.createElement('a');
    a.setAttribute('href', 'data:text/xml;charset=utf-8,' + encodeURIComponent(musicXml));
    a.setAttribute('download', `${filename}.musicxml`);
    a.innerText = `${filename}.musicxml`;
    div.querySelector('.sheet-musicxml').appendChild(a);
    sheets.appendChild(div);
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
