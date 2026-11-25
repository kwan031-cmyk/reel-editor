// Language picker. The app keeps writing Korean; a watcher swaps every Korean text it puts on screen
// (text, aria-label, placeholder, title) for the chosen language using the table below.
// {n} = a number, {} = any text (translated again if it is itself in the table). Placeholders keep their order.
export const LANGS = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文', es: 'Español' };
const COL = { en: 1, ja: 2, zh: 3, es: 4 };

// [ko, en, ja, zh, es]
const T = [
  // header, viewer, tabs
  ['🆕 새로 만들기', '🆕 New', '🆕 新規作成', '🆕 新建', '🆕 Nuevo'],
  ['영상만 넣으면 뚝딱. 영상은 이 기기 밖으로 나가지 않아요.', 'Add videos and it\'s done. Your videos never leave this device.', '動画を入れるだけで完成。動画はこの端末の外に出ません。', '放入视频就搞定。视频不会离开这台设备。', 'Añade tus vídeos y listo. Tus vídeos nunca salen de este dispositivo.'],
  ['영상을 넣으면', 'Add a video', '動画を入れると', '放入视频后', 'Añade un vídeo'],
  ['여기서 보여요', 'and it shows here', 'ここに表示されます', '会在这里显示', 'y se verá aquí'],
  ['처음으로', 'To start', '最初へ', '回到开头', 'Al inicio'],
  ['재생', 'Play', '再生', '播放', 'Reproducir'],
  ['멈추기', 'Pause', '一時停止', '暂停', 'Pausa'],
  ['재생 위치', 'Playback position', '再生位置', '播放位置', 'Posición'],
  ['미리보기', 'Preview', 'プレビュー', '预览', 'Vista previa'],
  ['👀 미리보기', '👀 Preview', '👀 プレビュー', '👀 预览', '👀 Vista previa'],
  ['✨ 완성된 영상', '✨ Finished video', '✨ 完成した動画', '✨ 完成的视频', '✨ Vídeo terminado'],
  ['✏️ 다시 고치기', '✏️ Edit again', '✏️ もう一度編集', '✏️ 重新编辑', '✏️ Editar de nuevo'],
  ['그림을 끌면 순서가 바뀌어요 · 동그라미는 넘어가는 효과', 'Drag a picture to reorder · circles are transitions', '絵をドラッグで順番変更 · 丸は切り替え効果', '拖动图片可调整顺序 · 圆圈是转场效果', 'Arrastra una imagen para reordenar · los círculos son transiciones'],
  ['넣기', 'Add', '追加', '添加', 'Añadir'],
  ['자르기', 'Cut', 'カット', '剪辑', 'Cortar'],
  ['글자', 'Text', '文字', '文字', 'Texto'],
  ['음악', 'Music', '音楽', '音乐', 'Música'],
  ['모양', 'Shape', '形', '样式', 'Formato'],
  // 1 add
  ['영상을 넣어요', 'Add your videos', '動画を入れましょう', '放入视频', 'Añade tus vídeos'],
  ['＋ 영상 고르기', '＋ Choose videos', '＋ 動画を選ぶ', '＋ 选择视频', '＋ Elegir vídeos'],
  ['(여러 개 OK)', '(several OK)', '(複数OK)', '(可多选)', '(varios OK)'],
  ['🪄 알아서 뚝딱 만들기', '🪄 Make it for me', '🪄 おまかせで作る', '🪄 一键自动制作', '🪄 Hazlo por mí'],
  ['재미있는 장면만 골라 이어 붙이고 영상까지 다 만들어 줘요. 몇 초짜리로 만들까요?', 'It picks the fun parts, joins them and makes the whole video. How long should it be?', '面白い場面だけを選んでつなぎ、動画まで全部作ります。何秒にしますか？', '自动挑出精彩片段拼接，直接做好整个视频。要做多长？', 'Elige las mejores partes, las une y crea el vídeo. ¿Cuánto debe durar?'],
  ['🪄 뚝딱 만들기', '🪄 Make it', '🪄 作る', '🪄 一键制作', '🪄 Crear'],
  ['✋ 그만하기 (취소)', '✋ Stop (cancel)', '✋ やめる (キャンセル)', '✋ 停止 (取消)', '✋ Parar (cancelar)'],
  ['다음: 자르기 ▶', 'Next: Cut ▶', '次へ: カット ▶', '下一步: 剪辑 ▶', 'Siguiente: Cortar ▶'],
  // 2 cut
  ['필요한 부분만 남겨요', 'Keep only the parts you need', '必要な部分だけ残しましょう', '只保留需要的部分', 'Quédate solo con lo necesario'],
  ['먼저 1번에서 영상을 넣어요.', 'First add videos in step 1.', 'まず1番で動画を入れてください。', '请先在第1步放入视频。', 'Primero añade vídeos en el paso 1.'],
  ['✨ 하이라이트 고르기', '✨ Pick highlights', '✨ ハイライトを選ぶ', '✨ 挑选精彩片段', '✨ Elegir momentos destacados'],
  ['움직임이 많고 소리가 큰 장면을 찾아 줘요. 장면을 눌러 미리 보고, 쓸 장면만 골라요.', 'It finds scenes with lots of movement and sound. Tap a scene to preview it and pick the ones you want.', '動きが多く音が大きい場面を探します。場面を押して確認し、使う場面だけ選びます。', '会找出动作多、声音大的片段。点一下预览，只选要用的片段。', 'Busca escenas con mucho movimiento y sonido. Toca una escena para verla y elige las que quieras.'],
  ['✨ 하이라이트 찾기', '✨ Find highlights', '✨ ハイライトを探す', '✨ 查找精彩片段', '✨ Buscar momentos destacados'],
  ['▶ 고른 장면으로 바꾸기', '▶ Use the chosen scenes', '▶ 選んだ場面に置き換える', '▶ 换成选中的片段', '▶ Usar las escenas elegidas'],
  ['↩ 처음 영상으로 되돌리기', '↩ Back to the original videos', '↩ 元の動画に戻す', '↩ 恢复原来的视频', '↩ Volver a los vídeos originales'],
  ['✂️ 직접 자르기', '✂️ Cut by hand', '✂️ 自分でカット', '✂️ 手动剪辑', '✂️ Cortar a mano'],
  ['◀ 이전: 넣기', '◀ Back: Add', '◀ 前へ: 追加', '◀ 上一步: 添加', '◀ Atrás: Añadir'],
  ['다음: 글자 ▶', 'Next: Text ▶', '次へ: 文字 ▶', '下一步: 文字 ▶', 'Siguiente: Texto ▶'],
  // 3 text
  ['글자를 넣어요', 'Add text', '文字を入れましょう', '添加文字', 'Añade texto'],
  ['⏱ 막대로 글자가 나올 때로 가서 모양을 눌러요. 그다음 화면을', '⏱ Move the bar to when the text should appear and tap a style. Then', '⏱ バーで文字を出す時点に移動し、形を押します。その後画面を', '⏱ 用进度条移到文字出现的时间，点一个样式。然后', '⏱ Mueve la barra al momento en que debe salir el texto y toca un estilo. Luego'],
  ['누르거나 끌어서', 'tap or drag', '押すかドラッグして', '点击或拖动画面', 'toca o arrastra'],
  ['자리를 옮겨요.', 'on the screen to move it.', '位置を動かします。', '来移动位置。', 'en la pantalla para moverlo.'],
  ['넣을 글자', 'Your text', '入れる文字', '要添加的文字', 'Tu texto'],
  ['글씨체', 'Font', 'フォント', '字体', 'Fuente'],
  ['색깔', 'Colour', '色', '颜色', 'Color'],
  ['크기', 'Size', 'サイズ', '大小', 'Tamaño'],
  ['나오는 때', 'When it shows', '表示する時間', '显示时间', 'Cuándo aparece'],
  ['시작 초', 'Start second', '開始秒', '开始秒', 'Segundo inicial'],
  ['초부터', 's from', '秒から', '秒开始', 's desde'],
  ['끝 초', 'End second', '終了秒', '结束秒', 'Segundo final'],
  ['초까지', 's until', '秒まで', '秒结束', 's hasta'],
  ['⏵ 지금부터', '⏵ From now', '⏵ 今から', '⏵ 从现在', '⏵ Desde ahora'],
  ['⏹ 지금까지', '⏹ Until now', '⏹ 今まで', '⏹ 到现在', '⏹ Hasta ahora'],
  ['✔ 다 했어요', '✔ Done', '✔ できた', '✔ 完成', '✔ Listo'],
  ['🗑 지우기', '🗑 Delete', '🗑 削除', '🗑 删除', '🗑 Borrar'],
  ['◀ 이전: 자르기', '◀ Back: Cut', '◀ 前へ: カット', '◀ 上一步: 剪辑', '◀ Atrás: Cortar'],
  ['다음: 음악 ▶', 'Next: Music ▶', '次へ: 音楽 ▶', '下一步: 音乐 ▶', 'Siguiente: Música ▶'],
  ['큰 제목', 'Big title', '大見出し', '大标题', 'Título grande'],
  ['자막', 'Subtitle', '字幕', '字幕', 'Subtítulo'],
  ['강조', 'Highlight', '強調', '强调', 'Destacado'],
  ['라벨', 'Label', 'ラベル', '标签', 'Etiqueta'],
  ['손글씨', 'Handwriting', '手書き', '手写', 'A mano'],
  ['제목을 적어요', 'Write a title', 'タイトルを書いて', '写个标题', 'Escribe un título'],
  ['자막을 적어요', 'Write a subtitle', '字幕を書いて', '写个字幕', 'Escribe un subtítulo'],
  ['여기 주목!', 'Look here!', 'ここに注目!', '看这里!', '¡Mira aquí!'],
  ['오늘의 추천', 'Today\'s pick', '今日のおすすめ', '今日推荐', 'Lo mejor de hoy'],
  ['손글씨 메모', 'A handwritten note', '手書きメモ', '手写便签', 'Una nota a mano'],
  ['굵게', 'Bold', '太字', '粗体', 'Negrita'],
  ['깔끔', 'Clean', 'すっきり', '简洁', 'Limpia'],
  ['귀엽게', 'Cute', 'かわいく', '可爱', 'Divertida'],
  ['(빈 글자)', '(empty)', '(空)', '(空)', '(vacío)'],
  ['색 {}', 'Colour {}', '色 {}', '颜色 {}', 'Color {}'],
  ['{} · {} · {n}~{n}초', '{} · {} · {n}–{n}s', '{} · {} · {n}~{n}秒', '{} · {} · {n}~{n}秒', '{} · {} · {n}–{n} s'],
  // 4 music
  ['음악을 넣어요', 'Add music', '音楽を入れましょう', '添加音乐', 'Añade música'],
  ['(안 넣어도 돼요)', '(optional)', '(なくてもOK)', '(可不加)', '(opcional)'],
  ['음악 고르기', 'Choose music', '音楽を選ぶ', '选择音乐', 'Elegir música'],
  ['음악 고르기 (선택)', 'Choose music (optional)', '音楽を選ぶ (任意)', '选择音乐 (可选)', 'Elegir música (opcional)'],
  ['음악 소리', 'Music volume', '音楽の音量', '音乐音量', 'Volumen de la música'],
  ['음악 빼기', 'Remove music', '音楽を外す', '移除音乐', 'Quitar música'],
  ['영상 원래 소리', 'Original video sound', '動画の元の音', '视频原声', 'Sonido original'],
  ['🔊 켜기', '🔊 On', '🔊 オン', '🔊 开', '🔊 Sí'],
  ['🔇 끄기', '🔇 Off', '🔇 オフ', '🔇 关', '🔇 No'],
  ['◀ 이전: 글자', '◀ Back: Text', '◀ 前へ: 文字', '◀ 上一步: 文字', '◀ Atrás: Texto'],
  ['다음: 모양 ▶', 'Next: Shape ▶', '次へ: 形 ▶', '下一步: 样式 ▶', 'Siguiente: Formato ▶'],
  // 5 shape + make
  ['영상 모양을 골라요', 'Choose the video shape', '動画の形を選びましょう', '选择视频样式', 'Elige el formato del vídeo'],
  ['어디에 올려요?', 'Where will you post it?', 'どこに投稿しますか？', '要发到哪里？', '¿Dónde lo publicarás?'],
  ['📱 세로', '📱 Vertical', '📱 縦', '📱 竖屏', '📱 Vertical'],
  ['릴스·쇼츠', 'Reels · Shorts', 'リール・ショート', 'Reels · Shorts', 'Reels · Shorts'],
  ['🖥 가로', '🖥 Horizontal', '🖥 横', '🖥 横屏', '🖥 Horizontal'],
  ['유튜브', 'YouTube', 'YouTube', 'YouTube', 'YouTube'],
  ['화면 채우기', 'Fill the screen', '画面の合わせ方', '画面填充', 'Llenar la pantalla'],
  ['꽉 채우기', 'Fill', 'いっぱいに', '铺满', 'Llenar'],
  ['전부 보이기', 'Show all', '全部見せる', '完整显示', 'Ver todo'],
  ['화질', 'Quality', '画質', '画质', 'Calidad'],
  ['선명하게', 'Sharp', '高画質', '清晰', 'Nítido'],
  ['빠르게', 'Fast', '速い', '快速', 'Rápido'],
  ['🎬 다 됐으면 만들어요', '🎬 All set? Make it', '🎬 できたら作りましょう', '🎬 准备好了就制作', '🎬 ¿Todo listo? Créalo'],
  ['🎬 영상 만들기', '🎬 Make video', '🎬 動画を作る', '🎬 制作视频', '🎬 Crear vídeo'],
  ['💾 저장하기', '💾 Save', '💾 保存', '💾 保存', '💾 Guardar'],
  ['📤 공유 / 사진첩', '📤 Share / Photos', '📤 共有 / 写真', '📤 分享 / 相册', '📤 Compartir / Fotos'],
  ['🆕 새 영상 처음부터 만들기', '🆕 Start a new video', '🆕 新しい動画を最初から作る', '🆕 从头制作新视频', '🆕 Empezar un vídeo nuevo'],
  ['✨ 하이라이트 장면 따로 저장', '✨ Save highlight scenes separately', '✨ ハイライト場面を個別に保存', '✨ 单独保存精彩片段', '✨ Guardar escenas destacadas por separado'],
  ['2번 자르기 칸에서 하이라이트를 찾아 고르면, 그 장면을 하나씩 mp4로 저장해요. (글자·음악 없이 원래 소리)', 'Find and pick highlights in step 2 (Cut), and each scene is saved as its own mp4. (no text or music, original sound)', '2番のカットでハイライトを探して選ぶと、その場面を1つずつmp4で保存します。(文字・音楽なし、元の音)', '在第2步剪辑中找到并选好精彩片段后，会把每个片段分别保存为mp4。(无文字和音乐，保留原声)', 'Busca y elige momentos en el paso 2 (Cortar) y cada escena se guarda como un mp4. (sin texto ni música, sonido original)'],
  ['⬇ 장면마다 따로 저장', '⬇ Save each scene', '⬇ 場面ごとに保存', '⬇ 逐个保存片段', '⬇ Guardar cada escena'],
  ['◀ 이전: 음악', '◀ Back: Music', '◀ 前へ: 音楽', '◀ 上一步: 音乐', '◀ Atrás: Música'],
  // footer, card template, dialogs
  ['만든이', 'Made by', '制作', '作者', 'Hecho por'],
  ['· 제작일자 2026년 11월 17일 · 👀 방문', '· Made on 17 Nov 2026 · 👀 Visits', '· 制作日 2026年11月17日 · 👀 訪問', '· 制作日期 2026年11月17日 · 👀 访问', '· Creado el 17 nov 2026 · 👀 Visitas'],
  ['· 🎬 만든 영상', '· 🎬 Videos made', '· 🎬 作った動画', '· 🎬 已制作视频', '· 🎬 Vídeos creados'],
  ['💬 의견 보내기', '💬 Send feedback', '💬 意見を送る', '💬 发送意见', '💬 Enviar comentarios'],
  ['이 영상은 미리보기가 안 되지만 만들기는 돼요.', 'This video can\'t be previewed, but it can still be used.', 'この動画はプレビューできませんが、作ることはできます。', '这个视频无法预览，但可以用来制作。', 'Este vídeo no se puede previsualizar, pero sí usar.'],
  ['화면 아래 ▶로 영상을 틀고, 원하는 곳에서 버튼을 눌러요.', 'Play the video with ▶ under the screen and tap the buttons where you want.', '画面下の▶で再生し、好きなところでボタンを押します。', '用画面下方的▶播放，在想要的位置点按钮。', 'Reproduce con ▶ bajo la pantalla y toca los botones donde quieras.'],
  ['⏵ 여기부터', '⏵ Start here', '⏵ ここから', '⏵ 从这里开始', '⏵ Empieza aquí'],
  ['⏹ 여기까지', '⏹ End here', '⏹ ここまで', '⏹ 到这里结束', '⏹ Termina aquí'],
  ['시작', 'Start', '開始', '开始', 'Inicio'],
  ['초', 's', '秒', '秒', 's'],
  ['끝', 'End', '終了', '结束', 'Fin'],
  ['순서 앞으로', 'Move earlier', '前へ移動', '往前移', 'Mover antes'],
  ['◀ 순서 앞으로', '◀ Move earlier', '◀ 前へ移動', '◀ 往前移', '◀ Mover antes'],
  ['순서 뒤로', 'Move later', '後ろへ移動', '往后移', 'Mover después'],
  ['순서 뒤로 ▶', 'Move later ▶', '後ろへ移動 ▶', '往后移 ▶', 'Mover después ▶'],
  ['🗑 빼기', '🗑 Remove', '🗑 外す', '🗑 移除', '🗑 Quitar'],
  ['더 하기 (넘어가는 효과 · 튀는 소리)', 'More (transition · loud spots)', 'その他 (切り替え効果 · 大きな音)', '更多 (转场效果 · 突兀的声音)', 'Más (transición · ruidos fuertes)'],
  ['다음 영상으로 넘어가는 효과', 'Transition to the next video', '次の動画への切り替え効果', '切换到下一个视频的效果', 'Transición al siguiente vídeo'],
  ['🔊 튀는 소리 찾기', '🔊 Find loud spots', '🔊 大きな音を探す', '🔊 查找突兀的声音', '🔊 Buscar ruidos fuertes'],
  ['🔊 튀는 소리 다시 보기', '🔊 Check loud spots again', '🔊 大きな音をもう一度確認', '🔊 再次检查突兀的声音', '🔊 Revisar ruidos otra vez'],
  ['튀는 부분 소리 줄이기', 'Turn the loud spots down', '大きな部分の音を下げる', '降低突兀部分的音量', 'Bajar los ruidos fuertes'],
  ['불편한 점, 바라는 기능, 무엇이든 적어 주세요. 만든이만 읽어요.', 'Problems, wishes, anything at all. Only the maker reads it.', '不便な点、欲しい機能、何でも書いてください。作者だけが読みます。', '不方便的地方、想要的功能，什么都可以写。只有作者会看。', 'Problemas, ideas, lo que sea. Solo lo lee el autor.'],
  ['예: 폰에서 저장 버튼이 잘 안 눌려요', 'e.g. The save button is hard to tap on my phone', '例: スマホで保存ボタンが押しにくい', '例如: 手机上保存按钮不好点', 'p. ej.: El botón de guardar cuesta pulsarlo en el móvil'],
  ['닫기', 'Close', '閉じる', '关闭', 'Cerrar'],
  ['보내기', 'Send', '送る', '发送', 'Enviar'],
  ['A 영상에서 B 영상으로 이렇게 넘어가요. 눌러서 골라요.', 'This is how video A moves to video B. Tap to choose.', 'A動画からB動画へこう切り替わります。押して選びます。', '视频A这样切换到视频B。点击选择。', 'Así pasa el vídeo A al vídeo B. Toca para elegir.'],
  ['모든 연결에 똑같이 넣기', 'Use for every join', 'すべてのつなぎに同じく使う', '所有衔接都用这个', 'Usar en todas las uniones'],
  ['넘어가는 시간 (모든 연결에 적용)', 'Transition time (all joins)', '切り替え時間 (すべてのつなぎ)', '转场时长 (应用到所有衔接)', 'Duración de la transición (todas)'],
  ['보통', 'Normal', '普通', '普通', 'Normal'],
  ['느리게', 'Slow', 'ゆっくり', '慢', 'Lento'],
  ['아주 느리게', 'Very slow', 'とてもゆっくり', '很慢', 'Muy lento'],
  ['0.05초 줄이기', '0.05 s shorter', '0.05秒短く', '缩短0.05秒', '0,05 s menos'],
  ['넘어가는 시간', 'Transition time', '切り替え時間', '转场时长', 'Duración'],
  ['0.05초 늘리기', '0.05 s longer', '0.05秒長く', '延长0.05秒', '0,05 s más'],
  ['직접 입력', 'Type it in', '直接入力', '手动输入', 'Escribir'],
  ['초 (0.05초 단위, 0.05~3)', 's (0.05 s steps, 0.05–3)', '秒 (0.05秒単位、0.05~3)', '秒 (以0.05秒为单位，0.05~3)', 's (pasos de 0,05 s, 0,05–3)'],
  // transitions
  ['바로 넘기기 (컷)', 'Straight cut', 'すぐ切り替え (カット)', '直接切换 (硬切)', 'Corte directo'],
  ['부드럽게 겹치기', 'Soft blend', 'なめらかに重ねる', '柔和叠化', 'Fundido suave'],
  ['렌즈 가리기 (검은 화면)', 'Lens cover (black)', 'レンズを隠す (黒画面)', '遮住镜头 (黑屏)', 'Tapar la lente (negro)'],
  ['하얀 번쩍', 'White flash', '白いフラッシュ', '白色闪光', 'Destello blanco'],
  ['빨려 들어가기 (줌)', 'Zoom in', '吸い込まれる (ズーム)', '吸入 (缩放)', 'Zoom hacia dentro'],
  ['옆으로 휙 밀기', 'Swipe sideways', '横にサッと押す', '横向滑走', 'Deslizar a un lado'],
  ['흐려지며 넘기기', 'Blur through', 'ぼかして切り替え', '模糊切换', 'Desenfoque'],
  ...['✂', '◐', '●', '✦', '◎', '⇠', '≋'].map((i) => Array(5).fill(`${i} {}`)), // icon + transition name in one text
  ['트랜지션: {} (눌러서 바꾸기)', 'Transition: {} (tap to change)', 'トランジション: {} (押して変更)', '转场: {} (点击更改)', 'Transición: {} (toca para cambiar)'],
  ['{n}번 → {n}번 영상 트랜지션', 'Transition: clip {n} → clip {n}', '{n}番 → {n}番 動画のトランジション', '视频{n} → 视频{n} 的转场', 'Transición: clip {n} → clip {n}'],
  // clips and numbers
  ['{n}초', '{n}s', '{n}秒', '{n}秒', '{n} s'],
  ['{n} / {n}초', '{n} / {n}s', '{n} / {n}秒', '{n} / {n}秒', '{n} / {n} s'],
  ['{n}초 사용', '{n}s used', '{n}秒 使用', '使用{n}秒', '{n} s usados'],
  ['{n}번 영상', 'Clip {n}', '動画{n}', '视频{n}', 'Clip {n}'],
  ['✂️ {n}번 영상 자르기', '✂️ Cutting clip {n}', '✂️ 動画{n}をカット', '✂️ 剪辑视频{n}', '✂️ Cortando clip {n}'],
  ['▶ {n}초', '▶ {n}s', '▶ {n}秒', '▶ {n}秒', '▶ {n} s'],
  ['길이 확인 중…', 'Checking length…', '長さを確認中…', '正在检查时长…', 'Comprobando duración…'],
  ['읽을 수 없는 영상', 'Can\'t read this video', '読み込めない動画', '无法读取的视频', 'No se puede leer el vídeo'],
  ['🔊 소리 살펴보는 중… {n}%', '🔊 Listening… {n}%', '🔊 音を確認中… {n}%', '🔊 正在分析声音… {n}%', '🔊 Analizando sonido… {n}%'],
  ['소리를 살펴보지 못했어요. 다시 눌러 주세요.', 'Couldn\'t check the sound. Please tap again.', '音を確認できませんでした。もう一度押してください。', '无法分析声音。请再点一次。', 'No se pudo analizar el sonido. Toca otra vez.'],
  ['소리가 없는 영상이에요.', 'This video has no sound.', '音のない動画です。', '这个视频没有声音。', 'Este vídeo no tiene sonido.'],
  ['튀는 소리 {n}곳 (빨간 부분) — 눌러서 들어 보세요:', '{n} loud spots (in red) — tap to listen:', '大きな音 {n}か所 (赤い部分) — 押して聞いてみて:', '{n}处突兀的声音 (红色部分) — 点击试听:', '{n} ruidos fuertes (en rojo) — toca para escuchar:'],
  ['고른 구간에 튀는 소리가 없어요 👍', 'No loud spots in this part 👍', '選んだ区間に大きな音はありません 👍', '所选片段没有突兀的声音 👍', 'No hay ruidos fuertes en esta parte 👍'],
  ['전체 길이: {n}초', 'Total length: {n}s', '全体の長さ: {n}秒', '总时长: {n}秒', 'Duración total: {n} s'],
  ['전체 길이: {n}초 — 릴스는 90초까지라 조금 줄이는 게 좋아요', 'Total length: {n}s — Reels allow up to 90 s, so shorten it a bit', '全体の長さ: {n}秒 — リールは90秒までなので少し短くしましょう', '总时长: {n}秒 — Reels最长90秒，建议剪短一点', 'Duración total: {n} s — los Reels admiten hasta 90 s, acórtalo un poco'],
  ['⏳ 넣은 영상이 크거나 길어요 ({n}개 · {n}분 · {n} MB). 만들 때 몇 분 넘게 걸릴 수 있어요. 폰에서는 5번 모양 칸의 "빠르게 720p"가 더 빨라요. 만드는 동안 화면을 끄거나 다른 앱으로 가면 멈출 수 있어요.',
    '⏳ Your videos are large or long ({n} files · {n} min · {n} MB). Making it may take several minutes. On a phone, "Fast 720p" in step 5 is quicker. Turning off the screen or switching apps while it works can stop it.',
    '⏳ 動画が大きいか長いです ({n}個 · {n}分 · {n} MB)。作るのに数分以上かかることがあります。スマホでは5番「形」の「速い 720p」が速いです。作成中に画面を消したり他のアプリに移ると止まることがあります。',
    '⏳ 放入的视频较大或较长 ({n}个 · {n}分钟 · {n} MB)。制作可能需要几分钟以上。手机上用第5步样式中的"快速 720p"更快。制作时关屏或切到其他应用可能会中断。',
    '⏳ Tus vídeos son grandes o largos ({n} archivos · {n} min · {n} MB). Puede tardar varios minutos. En el móvil, "Rápido 720p" del paso 5 es más rápido. Si apagas la pantalla o cambias de app mientras se crea, puede detenerse.'],
  // engine and making
  ['편집 엔진 내려받는 중… {n} / 31 MB (처음 한 번만)', 'Downloading the editor… {n} / 31 MB (first time only)', '編集エンジンをダウンロード中… {n} / 31 MB (初回のみ)', '正在下载编辑引擎… {n} / 31 MB (仅首次)', 'Descargando el editor… {n} / 31 MB (solo la primera vez)'],
  ['편집 엔진 켜는 중…', 'Starting the editor…', '編集エンジンを起動中…', '正在启动编辑引擎…', 'Iniciando el editor…'],
  ['먼저 1번에서 영상을 골라 주세요.', 'Please choose videos in step 1 first.', 'まず1番で動画を選んでください。', '请先在第1步选择视频。', 'Primero elige vídeos en el paso 1.'],
  ['준비 중…', 'Getting ready…', '準備中…', '准备中…', 'Preparando…'],
  ['영상 길이 확인 중… {n}/{n}', 'Checking video length… {n}/{n}', '動画の長さを確認中… {n}/{n}', '正在检查视频时长… {n}/{n}', 'Comprobando duración… {n}/{n}'],
  ['만드는 중… {n}%', 'Making… {n}%', '作成中… {n}%', '制作中… {n}%', 'Creando… {n}%'],
  ['만드는 중… {n}% (약 {n}분 남음)', 'Making… {n}% (about {n} min left)', '作成中… {n}% (残り約{n}分)', '制作中… {n}% (约剩{n}分钟)', 'Creando… {n}% (quedan unos {n} min)'],
  ['완성! ({n} MB, {n}초 걸림)', 'Done! ({n} MB, took {n} s)', '完成! ({n} MB、{n}秒かかりました)', '完成! ({n} MB，用时{n}秒)', '¡Listo! ({n} MB, tardó {n} s)'],
  ['영상 만들기를 그만했어요. 다시 하려면 🎬 영상 만들기를 눌러요.', 'Stopped making the video. Tap 🎬 Make video to try again.', '動画作成をやめました。もう一度なら 🎬 動画を作る を押してください。', '已停止制作视频。要重新制作请点 🎬 制作视频。', 'Se detuvo la creación. Toca 🎬 Crear vídeo para intentarlo de nuevo.'],
  ['만들기에 실패했어요. 영상이 길거나 기기 메모리가 부족할 수 있어요. 5번 모양 칸에서 "빠르게 720p"를 고르거나 영상을 짧게 잘라서 다시 해 보세요.', 'Making failed. The videos may be too long or the device low on memory. Choose "Fast 720p" in step 5 or cut the videos shorter and try again.', '作成に失敗しました。動画が長いか端末のメモリ不足かもしれません。5番「形」で「速い 720p」を選ぶか、動画を短く切ってもう一度試してください。', '制作失败。可能是视频太长或设备内存不足。请在第5步选择"快速 720p"，或把视频剪短后再试。', 'No se pudo crear. Puede que los vídeos sean largos o falte memoria. Elige "Rápido 720p" en el paso 5 o acorta los vídeos y prueba otra vez.'],
  // highlights
  ['영상 살펴보는 중… {n}/{n}번 ({n}%)', 'Looking through videos… {n}/{n} ({n}%)', '動画を確認中… {n}/{n}本目 ({n}%)', '正在查看视频… 第{n}/{n}个 ({n}%)', 'Revisando vídeos… {n}/{n} ({n}%)'],
  ['장면 {n}개를 찾았어요. 장면을 누르면 미리 볼 수 있어요. 쓸 장면을 고르고 "고른 장면으로 바꾸기"를 눌러요. (★가 많을수록 움직임·소리가 커요)', 'Found {n} scenes. Tap a scene to preview it. Pick the ones you want and tap "Use the chosen scenes". (more ★ = more movement and sound)', '場面を{n}個見つけました。場面を押すとプレビューできます。使う場面を選んで「選んだ場面に置き換える」を押します。(★が多いほど動き・音が大きい)', '找到了{n}个片段。点一下可以预览。选好要用的片段后点"换成选中的片段"。(★越多动作和声音越大)', 'Se encontraron {n} escenas. Toca una para verla. Elige las que quieras y toca "Usar las escenas elegidas". (más ★ = más movimiento y sonido)'],
  ['그만했어요. 다시 하려면 버튼을 눌러요.', 'Stopped. Tap the button to try again.', 'やめました。もう一度ならボタンを押してください。', '已停止。要重新开始请点按钮。', 'Detenido. Toca el botón para intentarlo de nuevo.'],
  ['영상을 살펴보지 못했어요. 다시 눌러 주세요.', 'Couldn\'t look through the videos. Please tap again.', '動画を確認できませんでした。もう一度押してください。', '无法查看视频。请再点一次。', 'No se pudieron revisar los vídeos. Toca otra vez.'],
  ['추천 장면 {n}개를 이어 붙여 영상을 만들고 있어요. 다 되면 화면에 바로 나와요.', 'Joining {n} recommended scenes into a video. It shows on the screen when ready.', 'おすすめ場面{n}個をつないで動画を作っています。できたらすぐ画面に出ます。', '正在把{n}个推荐片段拼成视频。做好后会直接显示在画面上。', 'Uniendo {n} escenas recomendadas en un vídeo. Aparecerá en pantalla al terminar.'],
  ['영상 만들기를 그만했어요. 다시 하려면 버튼을 눌러요.', 'Stopped making the video. Tap the button to try again.', '動画作成をやめました。もう一度ならボタンを押してください。', '已停止制作视频。要重新制作请点按钮。', 'Se detuvo la creación. Toca el botón para intentarlo de nuevo.'],
  ['영상을 만들지 못했어요. 🎬 영상 만들기 아래 안내를 봐 주세요.', 'Couldn\'t make the video. See the note under 🎬 Make video.', '動画を作れませんでした。🎬 動画を作る の下の案内を見てください。', '无法制作视频。请看 🎬 制作视频 下方的说明。', 'No se pudo crear el vídeo. Mira la nota bajo 🎬 Crear vídeo.'],
  ['완성! 추천 장면 {n}개로 만든 영상이 화면에 나왔어요. 5번 모양 칸에서 💾 저장하기를 눌러요. 고치고 싶으면 2~5번 칸에서 바꾸고 다시 만들면 돼요.', 'Done! The video made from {n} recommended scenes is on the screen. Tap 💾 Save in step 5. To change it, edit steps 2–5 and make it again.', '完成! おすすめ場面{n}個で作った動画が画面に出ました。5番「形」で 💾 保存 を押します。直したいときは2~5番で変えて作り直せます。', '完成! 用{n}个推荐片段做的视频已显示在画面上。在第5步点 💾 保存。想修改的话，在第2~5步改好再重新制作。', '¡Listo! El vídeo con {n} escenas recomendadas está en pantalla. Toca 💾 Guardar en el paso 5. Para cambiarlo, edita los pasos 2–5 y créalo otra vez.'],
  ['✔ 쓸 거예요', '✔ Using it', '✔ 使う', '✔ 要用', '✔ La uso'],
  ['＋ 고르기', '＋ Pick', '＋ 選ぶ', '＋ 选择', '＋ Elegir'],
  ['고른 장면 {n}개 · {n}초', '{n} scenes chosen · {n}s', '選んだ場面 {n}個 · {n}秒', '已选{n}个片段 · {n}秒', '{n} escenas elegidas · {n} s'],
  ['{n}번 영상 · {n}~{n}초 {}', 'Clip {n} · {n}–{n}s {}', '動画{n} · {n}~{n}秒 {}', '视频{n} · {n}~{n}秒 {}', 'Clip {n} · {n}–{n} s {}'],
  ['저장할 장면을 하나 이상 골라 주세요. 그다음 5번 모양 칸에서 다시 눌러요.', 'Pick at least one scene to save, then tap again in step 5.', '保存する場面を1つ以上選んでください。その後5番「形」でもう一度押します。', '请至少选一个要保存的片段，然后在第5步再点一次。', 'Elige al menos una escena y vuelve a tocar en el paso 5.'],
  ['먼저 "✨ 하이라이트 찾기"를 눌러 장면을 찾아요. 고른 다음 5번 모양 칸에서 "장면마다 따로 저장"을 눌러요.', 'First tap "✨ Find highlights" to find scenes. After picking, tap "Save each scene" in step 5.', 'まず「✨ ハイライトを探す」を押して場面を探します。選んだら5番「形」で「場面ごとに保存」を押します。', '请先点"✨ 查找精彩片段"。选好后在第5步点"逐个保存片段"。', 'Primero toca "✨ Buscar momentos destacados". Después de elegir, toca "Guardar cada escena" en el paso 5.'],
  ['장면 저장 파일 만드는 중… {n}/{n}', 'Making scene files… {n}/{n}', '場面ファイルを作成中… {n}/{n}', '正在制作片段文件… {n}/{n}', 'Creando archivos de escenas… {n}/{n}'],
  ['⬇ {n}. {n}번 영상 {n}~{n}초 저장', '⬇ {n}. Save clip {n} {n}–{n}s', '⬇ {n}. 動画{n} {n}~{n}秒を保存', '⬇ {n}. 保存视频{n} {n}~{n}秒', '⬇ {n}. Guardar clip {n} {n}–{n} s'],
  ['📤 모두 공유 / 사진첩에 저장', '📤 Share all / Save to Photos', '📤 すべて共有 / 写真に保存', '📤 全部分享 / 存到相册', '📤 Compartir todo / Guardar en Fotos'],
  ['장면 {n}개 완성! 아래 버튼을 눌러 하나씩 저장해요.', '{n} scenes ready! Tap the buttons below to save them one by one.', '場面{n}個完成! 下のボタンで1つずつ保存します。', '{n}个片段完成! 点下面的按钮逐个保存。', '¡{n} escenas listas! Toca los botones de abajo para guardarlas una a una.'],
  ['그만했어요. 다 만든 장면은 아래 버튼으로 저장할 수 있어요.', 'Stopped. Scenes already made can be saved with the buttons below.', 'やめました。できた場面は下のボタンで保存できます。', '已停止。已做好的片段可以用下面的按钮保存。', 'Detenido. Las escenas ya creadas se pueden guardar con los botones de abajo.'],
  ['장면 파일을 만들지 못했어요. 화질을 "빠르게 720p"로 바꾸고 다시 해 보세요.', 'Couldn\'t make the scene files. Switch quality to "Fast 720p" and try again.', '場面ファイルを作れませんでした。画質を「速い 720p」にしてもう一度試してください。', '无法制作片段文件。请把画质改成"快速 720p"后再试。', 'No se pudieron crear las escenas. Cambia la calidad a "Rápido 720p" y prueba otra vez.'],
  ['샘플에 쓸 장면을 하나 이상 골라 주세요.', 'Pick at least one scene.', '場面を1つ以上選んでください。', '请至少选一个片段。', 'Elige al menos una escena.'],
  ['고른 장면으로 바꿨어요. 화면에서 바로 이어서 보여 줄게요. 마음에 들면 5번 모양 칸에서 🎬 영상 만들기를 눌러요.', 'Switched to the chosen scenes and playing them now. If you like it, tap 🎬 Make video in step 5.', '選んだ場面に置き換えました。画面ですぐ続けて再生します。気に入ったら5番「形」で 🎬 動画を作る を押します。', '已换成选中的片段，正在画面上连续播放。满意的话在第5步点 🎬 制作视频。', 'Cambiado a las escenas elegidas y reproduciéndolas. Si te gusta, toca 🎬 Crear vídeo en el paso 5.'],
  ['찾기 전 영상으로 돌아왔어요.', 'Back to the videos before the search.', '探す前の動画に戻りました。', '已恢复到查找前的视频。', 'De vuelta a los vídeos de antes.'],
  // feedback
  ['내용을 적어 주세요.', 'Please write something.', '内容を書いてください。', '请填写内容。', 'Escribe algo, por favor.'],
  ['보내는 중...', 'Sending...', '送信中...', '发送中...', 'Enviando...'],
  ['고마워요! 잘 전달됐어요 🙏', 'Thank you! It was sent 🙏', 'ありがとう! 届きました 🙏', '谢谢! 已成功发送 🙏', '¡Gracias! Enviado 🙏'],
  ['인터넷 연결을 확인하고 다시 눌러 주세요.', 'Check your internet connection and tap again.', 'インターネット接続を確認してもう一度押してください。', '请检查网络连接后再点一次。', 'Revisa tu conexión a internet y vuelve a tocar.'],
  ['지금 만든 내용(영상·글자·음악)이 모두 지워져요. 저장 안 한 영상은 사라져요.\n새로 만들까요?', 'Everything you made (videos, text, music) will be cleared. Unsaved videos will be lost.\nStart new?', '今作った内容(動画・文字・音楽)はすべて消えます。保存していない動画はなくなります。\n新しく作りますか？', '现在做的内容(视频·文字·音乐)会全部清除，未保存的视频会丢失。\n要重新开始吗？', 'Se borrará todo lo hecho (vídeos, texto, música). Los vídeos sin guardar se perderán.\n¿Empezar de nuevo?'],
];

const exact = new Map(), pats = [];
for (const row of T) {
  if (/\{n?\}/.test(row[0])) {
    const re = new RegExp('^' + row[0].split(/(\{n?\})/).map((p) =>
      p === '{n}' ? '([\\d.]+)' : p === '{}' ? '(.+?)' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$', 's');
    pats.push({ re, row });
  } else exact.set(row[0], row);
}

const saved = (() => { try { return localStorage.getItem('lang'); } catch { return null; } })();
let lang = saved in LANGS ? saved : (navigator.language || 'ko').slice(0, 2) in LANGS ? (navigator.language || 'ko').slice(0, 2) : 'ko';

function tr(s) {
  const c = COL[lang];
  const r = exact.get(s);
  if (r) return r[c];
  for (const { re, row } of pats) {
    const m = s.match(re);
    if (!m) continue;
    let i = 0;
    return row[c].replace(/\{n?\}/g, () => { const v = m[++i]; return tr(v) ?? v; });
  }
  return null;
}
// for text that does not pass through the page (alert, confirm, text drawn into the video)
export const t = (ko) => (lang === 'ko' ? ko : tr(ko) ?? ko);

// ---------- the watcher ----------
const ATTRS = ['aria-label', 'placeholder', 'title'];
const srcText = new WeakMap(), outText = new WeakMap(); // text node -> Korean source / what we wrote
const srcAttr = new WeakMap(); // element -> { attr: [Korean source, what we wrote] }
const HANGUL = /[가-힣]/;

function doText(n) {
  const cur = n.data;
  if (outText.get(n) !== cur) { if (!HANGUL.test(cur)) return; srcText.set(n, cur); } // new text from the app
  const src = srcText.get(n);
  if (src == null) return;
  const [, lead, body, tail] = src.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const out = lang === 'ko' ? src : lead + (tr(body) ?? body) + tail;
  outText.set(n, out);
  if (cur !== out) n.data = out;
}
function doAttr(el, a) {
  const cur = el.getAttribute(a);
  if (cur == null) return;
  const m = srcAttr.get(el) || {};
  if (!m[a] || m[a][1] !== cur) { if (!HANGUL.test(cur)) return; m[a] = [cur, cur]; srcAttr.set(el, m); }
  const out = lang === 'ko' ? m[a][0] : tr(m[a][0]) ?? m[a][0];
  m[a][1] = out;
  if (cur !== out) el.setAttribute(a, out);
}
function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1 || root.nodeName === 'SCRIPT' || root.nodeName === 'STYLE') return;
  ATTRS.forEach((a) => doAttr(root, a));
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? doText(n) : ATTRS.forEach((a) => doAttr(n, a));
}
new MutationObserver((list) => {
  for (const r of list) {
    if (r.type === 'childList') r.addedNodes.forEach(walk);
    else if (r.type === 'characterData') doText(r.target);
    else doAttr(r.target, r.attributeName);
  }
}).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

function apply() {
  document.documentElement.lang = lang;
  walk(document.body);
}
const pick = document.querySelector('#lang');
pick.innerHTML = Object.entries(LANGS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
pick.value = lang;
pick.addEventListener('change', () => {
  lang = pick.value;
  try { localStorage.setItem('lang', lang); } catch {}
  apply();
});
apply();
