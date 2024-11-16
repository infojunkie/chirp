ChiRP 🎶🐦 iReal Pro to MusicXML / MuseScore / MIDI
============================

![Screenshot](https://github.com/infojunkie/chirp/blob/main/screenshot.png?raw=true)

# Usage
`npm i && npm run start`

# Theory of operation
This small web app parses an iReal Pro playlist and converts each song to MusicXML using the [`ireal-musicxml` JavaScript library](https://www.npmjs.com/package/ireal-musicxml). It then converts the MusicXML to:

- MuseScore format via the [`musicxml-mscx` XSLT transformation](https://github.com/infojunkie/musicxml-mscx)
- MIDI via the [`musicxml-midi` API service](https://github.com/infojunkie/musicxml-midi)

Finally, it zips up the generated files into a package using [`JSZip-ESM`](https://www.npmjs.com/package/@progress/jszip-esm).
