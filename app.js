// 숏폼 뚝딱: each step lives in its own file under js/; this file only starts the app.
import './js/state.js';     // shared settings and state
import './js/engine.js';    // ffmpeg engine, file probing, clip analysis, busy lock + 취소
import './js/clips.js';     // 1·2: add clips, cut cards, loud spots, transitions, order strip, options, music
import './js/text.js';      // 3: text templates drawn on the preview
import './js/preview.js';   // preview player and play controls
import './js/highlight.js'; // highlights + 🪄 auto make + per-scene save
import './js/export.js';    // 5: make the mp4
import './js/extras.js';    // visitor counters, feedback box
import './js/views.js';     // one viewer, step tabs
import { refreshView } from './js/views.js';

refreshView();
