/* @vpb/core — shared taxonomy, model profiles, presets, prompt compiler, conflict rules & score.
   Pure JS (no DOM): used by the web app (browser) and the API (Node).
   Most functions read the module-level `state` (a PromptSpec-like object); use setState()/withState(). */

/* ============================================================
   1) TAXONOMY  —  [id, ป้ายไทย, emoji, English phrase, extras]
   ============================================================ */
const GROUPS = {};
function G(id, th, e, max, opts, x = {}) {
  GROUPS[id] = Object.assign({ id, th, e, max, opts: opts.map(a => Object.assign({ id: a[0], th: a[1], e: a[2], en: a[3] }, a[4] || {})) }, x);
}
// ---- Step 1: Basics
G('video_type','ประเภทวิดีโอ','🎞️',0,[
 ['short_film','หนังสั้น / ดราม่า','🎬','cinematic short film scene',{kw:['หนังสั้น','ดราม่า','ภาพยนตร์','short film','drama']}],
 ['product_ad','โฆษณาสินค้า','🛍️','high-end product commercial',{kw:['โฆษณา','สินค้า','commercial','product']}],
 ['music_video','Music Video','🎵','stylish music video',{kw:['mv','เอ็มวี','มิวสิค','music video']}],
 ['documentary','สารคดี','📽️','documentary scene',{kw:['สารคดี','documentary']}],
 ['travel_vlog','Vlog ท่องเที่ยว','✈️','travel vlog clip',{kw:['เที่ยว','vlog','วล็อก','travel']}],
 ['food','รีวิวอาหาร','🍜','mouth-watering food video',{kw:['รีวิวอาหาร','อาหาร','food','ต้มยำ','ก๋วยเตี๋ยว']}],
 ['explainer','สื่อการสอน / Explainer','🎓','clean educational explainer video',{kw:['สอน','อธิบาย','explainer','การศึกษา']}],
 ['trailer','Trailer / ทีเซอร์','🎞️','epic movie trailer shot',{kw:['ตัวอย่างหนัง','ทีเซอร์','trailer','teaser']}],
 ['fashion','Fashion film','👗','high-fashion film',{kw:['แฟชั่น','fashion']}],
 ['real_estate','รีวิวบ้าน / อสังหา','🏠','luxury real-estate walkthrough',{kw:['อสังหา','คอนโด','รีวิวบ้าน']}],
 ['gaming','เกม / Esports','🎮','game cinematic',{kw:['เกม','game','esports']}],
 ['broll','Stock / B-roll','📦','stock B-roll clip',{kw:['b-roll','stock']}],
 ['comedy','ตลก / มีม','😂','comedic sketch',{kw:['ตลก','มีม','comedy','meme']}],
 ['ugc','UGC Social ad','🤳','authentic UGC-style social media ad',{kw:['ugc','ป้ายยา']}],
 ['news','ข่าว / รายงาน','📰','news report clip',{kw:['ข่าว','news']}],
 ['logo','Logo reveal','✨','sleek logo reveal animation',{kw:['โลโก้','logo']}],
],{cards:true});
G('purpose','วัตถุประสงค์','🎯',2,[
 ['sell','กระตุ้นยอดขาย','💰','designed to drive sales'],
 ['brand','สร้างภาพลักษณ์แบรนด์','🏷️','building a premium brand image'],
 ['story','เล่าเรื่องสะเทือนใจ','📖','telling an emotional story'],
 ['educate','ให้ความรู้','💡','clearly explaining a concept'],
 ['entertain','ความบันเทิง','🎉','fun and entertaining'],
 ['inspire','สร้างแรงบันดาลใจ','🌟','inspiring and uplifting'],
 ['previz','Pre-viz / Storyboard','🗂️','intended as a pre-visualization'],
]);
G('platform','แพลตฟอร์ม & อัตราส่วนภาพ','📐',0,[
 ['tiktok','TikTok / Reels / Shorts','📱','vertical 9:16 composition',{ar:'9:16',kw:['tiktok','reels','shorts','ติ๊กต็อก','แนวตั้ง']}],
 ['youtube','YouTube แนวนอน','▶️','widescreen 16:9 composition',{ar:'16:9',kw:['youtube','ยูทูป','แนวนอน']}],
 ['square','Instagram 1:1','⬜','square 1:1 composition',{ar:'1:1'}],
 ['portrait45','IG / FB Feed 4:5','🖼️','4:5 portrait composition',{ar:'4:5'}],
 ['cinema','ภาพยนตร์ 2.39:1','🎦','ultra-wide 2.39:1 cinemascope framing',{ar:'2.39:1'}],
]);
G('duration','ความยาวคลิป','⏱️',0,[
 ['d4','4 วินาที','⏱️','',{val:4}],['d5','5 วินาที','⏱️','',{val:5}],['d8','8 วินาที','⏱️','',{val:8}],
 ['d10','10 วินาที','⏱️','',{val:10}],['d15','15 วินาที','⏱️','',{val:15}],['d20','20 วินาที','⏱️','',{val:20}],
]);
G('fps','Frame rate / ความเร็ว','🎞️',0,[
 ['fps24','24fps แบบหนัง','🎞️','cinematic 24fps motion blur',{fpsv:24}],
 ['fps60','60fps ลื่นไหล','🌊','smooth 60fps motion',{fpsv:60}],
 ['slowmo','สโลว์โมชัน','🐢','dramatic slow motion',{fpsv:120,kw:['สโลว์','slow motion','slow-mo','slowmo']}],
 ['timelapse','ไทม์แลปส์','⏩','timelapse',{kw:['ไทม์แลปส์','timelapse']}],
 ['hyperlapse','ไฮเปอร์แลปส์','🏃','hyperlapse',{kw:['hyperlapse']}],
 ['stopmo_feel','เฟรมกระตุกแบบสต็อปโมชัน','🧱','choppy stop-motion frame rate'],
 ['reverse','เล่นย้อนกลับ','⏪','reversed playback'],
]);
// ---- Step 2: Subject
G('count','จำนวน / ประเภท Subject','👥',0,[
 ['none','ไม่มีคน (วิว/ฉาก)','🏞️','an empty scene with no people',{kw:['วิว','ไม่มีคน']}],
 ['one','1 คน','🧍','a single person'],
 ['two','2 คน','👫','two people',{kw:['คู่รัก','สองคน']}],
 ['group','กลุ่มเล็ก 3–5 คน','👨‍👩‍👧','a small group of people',{kw:['กลุ่มเพื่อน','ครอบครัว']}],
 ['crowd','ฝูงชน','👥','a bustling crowd',{kw:['ฝูงชน','คนเยอะ']}],
 ['animal','สัตว์','🐈','an animal',{kw:['แมว','หมา','สุนัข','สัตว์','cat','dog']}],
 ['product','สินค้า / วัตถุ','📦','a product on display',{kw:['ขวด','สินค้า','กระป๋อง','product']}],
]);
G('age','อายุ','🎂',0,[
 ['child','เด็ก','🧒','child',{kw:['เด็ก']}],['teen','วัยรุ่น','🧑‍🎤','teenage',{kw:['วัยรุ่น']}],
 ['young','วัยทำงาน 20–30','🧑','young adult',{kw:['หญิงสาว','หนุ่มสาว']}],['middle','วัยกลางคน','🧔','middle-aged'],
 ['elder','ผู้สูงอายุ','👵','elderly',{kw:['คนแก่','ผู้สูงอายุ','คุณยาย','คุณตา']}],
]);
G('gender','เพศ','⚧️',0,[
 ['female','ผู้หญิง','👩','woman',{kw:['ผู้หญิง','หญิง','สาว','woman']}],
 ['male','ผู้ชาย','👨','man',{kw:['ผู้ชาย','หนุ่ม','man']}],
 ['nb','Non-binary','🧑','non-binary person'],['any','ไม่ระบุ','❔','person'],
]);
G('ethnicity','เชื้อชาติ / ลักษณะ','🌏',0,[
 ['thai','ไทย / อาเซียน','🇹🇭','Thai',{kw:['คนไทย']}],['east_asian','เอเชียตะวันออก','🏯','East Asian'],
 ['south_asian','เอเชียใต้','🪔','South Asian'],['black','ผิวดำ','🧑🏿','Black'],['white','ผิวขาว / ยุโรป','🧑🏼','Caucasian'],
 ['latino','ลาติน','💃','Latino'],['mideast','ตะวันออกกลาง','🕌','Middle Eastern'],['mixed','หลากหลาย','🌈','diverse'],
],{note:'ระบุเมื่อจำเป็นต่อเรื่องเท่านั้น — ระบบไม่เดาให้อัตโนมัติ'});
G('features','รูปร่าง / ทรงผม / ลักษณะเด่น','💇',3,[
 ['long_hair','ผมยาว','💇‍♀️','long flowing hair',{kw:['ผมยาว']}],['short_hair','ผมสั้น','💇','short hair',{kw:['ผมสั้น']}],
 ['curly','ผมหยิก','🌀','curly hair'],['bald','หัวโล้น','👨‍🦲','a shaved head'],['beard','หนวดเครา','🧔','a full beard'],
 ['glasses','ใส่แว่น','👓','round glasses',{kw:['แว่น']}],['tattoo','รอยสัก','🐉','visible tattoos'],['freckles','ฝ้ากระ','✨','freckles'],
 ['athletic','หุ่นนักกีฬา','💪','an athletic build'],['fur','ขนฟู (สัตว์)','🐾','fluffy fur'],
]);
G('clothing','เสื้อผ้า','👕',2,[
 ['casual','ลำลอง','👕','casual everyday clothes'],['suit','สูท / ทางการ','🤵','a tailored suit',{kw:['สูท']}],
 ['thai_dress','ชุดไทย','🪷','a traditional Thai costume',{kw:['ชุดไทย']}],['street','Streetwear','🧢','trendy streetwear'],
 ['sport','ชุดกีฬา','🏃','athletic sportswear'],['uniform','ชุดนักเรียน','🎒','a Thai school uniform',{kw:['นักเรียน']}],
 ['chef','ชุดเชฟ','👨‍🍳',"a chef's uniform",{kw:['เชฟ']}],['space','ชุดนักบินอวกาศ','👩‍🚀','a spacesuit',{kw:['นักบินอวกาศ']}],
 ['armor','ชุดเกราะ','🛡️','medieval armor',{kw:['อัศวิน','ชุดเกราะ']}],['techwear','Cyberpunk techwear','🦾','neon cyberpunk techwear'],
 ['gown','ชุดราตรี','👗','an elegant evening gown',{kw:['ชุดราตรี']}],['swim','ชุดว่ายน้ำ','🩱','swimwear'],
]);
G('expression','สีหน้า / อารมณ์ตัวละคร','🙂',0,[
 ['smile','ยิ้ม','😊','smiling warmly',{kw:['ยิ้ม']}],['laugh','หัวเราะ','😂','laughing joyfully',{kw:['หัวเราะ']}],
 ['sad','เศร้า / ร้องไห้','😢','tearful and heartbroken',{kw:['ร้องไห้']}],['angry','โกรธ','😠','angry and intense',{kw:['โกรธ']}],
 ['surprised','ตกใจ','😲','surprised and wide-eyed',{kw:['ตกใจ']}],['determined','มุ่งมั่น','😤','determined and focused',{kw:['มุ่งมั่น']}],
 ['calm','สงบ','😌','calm and serene'],['pensive','ครุ่นคิด','🤔','lost in thought',{kw:['ครุ่นคิด','คิดถึง']}],
 ['scared','หวาดกลัว','😨','terrified',{kw:['กลัว']}],['shy','เขินอาย','😳','shy and blushing',{kw:['เขิน']}],
]);
G('action','การกระทำ (Action)','🏃',2,[
 ['walk','เดิน','🚶','walking slowly',{kw:['เดิน']}],['run','วิ่ง','🏃','running fast',{kw:['วิ่ง']}],
 ['dance','เต้น','💃','dancing energetically',{kw:['เต้น']}],['cook','ทำอาหาร','🍳','cooking over a sizzling pan',{kw:['ทำอาหาร','ผัด']}],
 ['eat','กิน / ชิม','🍽️','taking a big satisfying bite',{kw:['กิน','ชิม']}],['talk','พูดกับกล้อง','🗣️','talking directly to the camera',{kw:['พูดกับกล้อง','รีวิว']}],
 ['fight','ต่อสู้','🥋','fighting with fast martial-arts moves',{kw:['ต่อสู้','ต่อย','ฟันดาบ']}],['drive','ขับรถ','🚗','driving a car',{kw:['ขับรถ']}],
 ['gaze','นั่งมองวิว','🪟','sitting and gazing out quietly',{kw:['นั่งมอง','นั่งดู','มองวิว']}],['look_cam','หันมามองกล้อง','👀','turning to look into the camera'],
 ['showcase','โชว์สินค้า','🤲','holding up and showcasing the product',{kw:['โชว์']}],['pour','เทเครื่องดื่ม','🫗','pouring a drink in a smooth stream',{kw:['เทน้ำ','เทเครื่องดื่ม','รินน้ำ']}],
 ['jump','กระโดด','🤸','leaping into the air',{kw:['กระโดด']}],['swim','ว่ายน้ำ','🏊','swimming gracefully',{kw:['ว่ายน้ำ']}],
 ['fly','บิน','🕊️','flying through the air',{kw:['บิน']}],['type','พิมพ์คอม','💻','typing on a laptop'],
 ['rotate','หมุนโชว์ 360°','🔄','slowly rotating on a turntable',{kw:['หมุนโชว์']}],
]);
G('interaction','ปฏิสัมพันธ์ (2 คนขึ้นไป)','🤝',0,[
 ['converse','คุยกัน','💬','having an intimate conversation'],['hug','กอดกัน','🤗','embracing each other',{kw:['กอด']}],
 ['argue','เถียงกัน','💢','arguing heatedly',{kw:['ทะเลาะ','เถียง']}],['handover','ส่งของให้กัน','🎁','handing an object to one another'],
 ['side','เดินคู่กัน','👣','walking side by side'],
]);
// ---- Step 3: Setting
G('location','สถานที่','📍',0,[
 ['city','เมืองใหญ่','🏙️','in a sprawling modern city',{kw:['เมือง','city']}],
 ['bangkok','ถนนกรุงเทพฯ','🛺','on a busy Bangkok street with tuk-tuks',{kw:['กรุงเทพ','bangkok','ตุ๊กตุ๊ก']}],
 ['market','ตลาดน้ำ / ตลาดนัด','🛶','at a colorful Thai floating market',{kw:['ตลาด']}],
 ['temple','วัดไทย','🛕','at an ornate Thai Buddhist temple',{kw:['วัดไทย','ในวัด','วัดพระ','temple']}],
 ['beach','ชายหาดเขตร้อน','🏝️','on a tropical beach with turquoise water',{kw:['ชายหาด','ทะเล','beach']}],
 ['mountain','ภูเขา / ป่า','⛰️','among misty mountains and pine forest',{kw:['ภูเขา','ดอย','ป่า']}],
 ['desert','ทะเลทราย','🏜️','in a vast golden desert',{kw:['ทะเลทราย','desert']}],
 ['arctic','ขั้วโลก / หิมะ','🧊','in a snowy arctic landscape',{kw:['ขั้วโลก']}],
 ['underwater','ใต้น้ำ','🐠','deep underwater',{kw:['ใต้น้ำ','ใต้ทะเล']}],
 ['space','อวกาศ','🪐','in outer space',{kw:['อวกาศ','space']}],
 ['cafe','คาเฟ่','☕','in a cozy cafe',{kw:['คาเฟ่','ร้านกาแฟ'],indoor:1}],
 ['bedroom','ห้องนอน','🛏️','in a cozy bedroom',{kw:['ห้องนอน'],indoor:1}],
 ['office','ออฟฟิศ','🏢','in a modern open-plan office',{kw:['ออฟฟิศ','ที่ทำงาน'],indoor:1}],
 ['studio','สตูดิโอฉากเรียบ','🎚️','against a clean seamless studio backdrop',{kw:['สตูดิโอ'],indoor:1}],
 ['kitchen','ครัว','🍳','in a warm home kitchen',{kw:['ครัว'],indoor:1}],
 ['street_food','ร้านสตรีทฟู้ด','🍢','at a bustling street-food stall',{kw:['สตรีทฟู้ด','ร้านข้างทาง']}],
 ['cyber_city','เมืองไซเบอร์พังก์','🌃','in a rain-soaked cyberpunk megacity',{kw:['ไซเบอร์พังก์','cyberpunk']}],
 ['castle','ปราสาทแฟนตาซี','🏰','in a towering fantasy castle',{kw:['ปราสาท']}],
 ['rice','ทุ่งนา','🌾','in lush green rice paddies',{kw:['ทุ่งนา','นาข้าว']}],
 ['stadium','สนามกีฬา','🏟️','in a packed stadium',{kw:['สนามกีฬา','สเตเดียม']}],
 ['train','บนรถไฟ','🚆','inside a moving train',{kw:['รถไฟ'],indoor:1}],
 ['stage','เวทีคอนเสิร์ต','🎤','on a concert stage',{kw:['คอนเสิร์ต','เวที']}],
 ['window','ริมหน้าต่าง','🪟','beside a rain-streaked window',{kw:['หน้าต่าง'],indoor:1}],
 ['rooftop','ดาดฟ้าตึก','🌇','on a city rooftop',{kw:['ดาดฟ้า','rooftop']}],
],{cards:true});
G('time','ช่วงเวลา','🕰️',0,[
 ['dawn','รุ่งเช้า','🌄','at dawn',{kw:['รุ่งเช้า','ตอนเช้า','เช้าตรู่']}],
 ['golden','Golden hour','🌅','during golden hour',{kw:['ตอนเย็น','พระอาทิตย์ตก','golden hour','แสงทอง']}],
 ['noon','กลางวัน','☀️','in bright midday',{kw:['กลางวัน','เที่ยงวัน']}],
 ['afternoon','บ่าย','🌤️','in the afternoon',{kw:['ตอนบ่าย']}],
 ['blue','Blue hour','🌆','during blue-hour twilight',{kw:['blue hour','โพล้เพล้']}],
 ['night','กลางคืน','🌙','at night',{kw:['กลางคืน','ตอนค่ำ','ตอนดึก','night']}],
 ['midnight','เที่ยงคืน','🌌','at midnight',{kw:['เที่ยงคืน']}],
]);
G('weather','สภาพอากาศ','🌦️',2,[
 ['clear','ฟ้าใส','☀️','under clear skies',{kw:['ฟ้าใส']}],['cloudy','เมฆครึ้ม','☁️','under overcast skies',{kw:['เมฆครึ้ม']}],
 ['drizzle','ฝนปรอยๆ','🌦️','in light drizzle',{kw:['ฝนปรอย']}],['rain','ฝนตก','🌧️','in steady rain',{kw:['ฝนตก','ฝน','rain']}],
 ['storm','พายุฝนฟ้าคะนอง','⛈️','in a heavy thunderstorm',{kw:['พายุ','ฟ้าร้อง']}],['fog','หมอก','🌫️','in thick fog',{kw:['หมอก']}],
 ['snowfall','หิมะตก','🌨️','with gently falling snow',{kw:['หิมะ']}],['wind','ลมแรง','🌬️','in strong wind'],
 ['dust','พายุฝุ่น / ทราย','🌪️','in a dusty sandstorm'],['after_rain','หลังฝน (พื้นเปียก)','💧','with wet reflective surfaces after rain',{kw:['หลังฝน']}],
]);
G('season','ฤดูกาล','🍂',0,[
 ['summer','ฤดูร้อน','🏖️','in the heat of summer'],['rainy','ฤดูฝน','☔','in the rainy season'],['winter','ฤดูหนาว','🧣','in winter'],
 ['spring','ใบไม้ผลิ / ซากุระ','🌸','in spring with cherry blossoms',{kw:['ซากุระ']}],['autumn','ใบไม้ร่วง','🍁','in autumn with falling leaves',{kw:['ใบไม้ร่วง']}],
]);
G('era','ยุคสมัย','🏛️',0,[
 ['modern','ปัจจุบัน','📱','present-day'],['future','อนาคต / Sci-fi','🚀','futuristic sci-fi',{kw:['อนาคต','sci-fi']}],
 ['e70s','ยุค 70s','🕺','1970s'],['e80s','ยุค 80s','📼','1980s retro',{kw:['80s','ยุค 80']}],['e90s','ยุค 90s','💾','1990s',{kw:['90s','ยุค 90']}],
 ['victorian','วิกตอเรียน','🎩','Victorian-era'],['medieval','ยุคกลาง','⚔️','medieval',{kw:['ยุคกลาง']}],
 ['ayutthaya','ไทยโบราณ / อยุธยา','🏯','ancient Ayutthaya-era Siamese',{kw:['อยุธยา','ไทยโบราณ']}],['postapoc','หลังวันสิ้นโลก','☢️','post-apocalyptic',{kw:['สิ้นโลก']}],
]);
// ---- Step 4: Camera
G('shot','ขนาดภาพ (Shot size)','🖼️',0,[
 ['ews','ภาพกว้างมาก (EWS)','🌐','extreme wide establishing shot',{tip:'เห็นสถานที่ทั้งหมด คนตัวเล็กมาก ใช้เปิดเรื่อง'}],
 ['wide','ภาพกว้าง','🏞️','wide shot'],['full','เต็มตัว','🧍','full-body shot'],['mws','กลางค่อนกว้าง','🤠','medium wide shot'],
 ['medium','ครึ่งตัว','👤','medium shot'],['mcu','ใกล้ระดับอก (MCU)','🙂','medium close-up'],['cu','ใกล้ (Close-up)','😶','close-up'],
 ['ecu','ใกล้มาก (ECU)','👁️','extreme close-up'],['insert','ภาพรายละเอียด','🔍','detail insert shot'],
 ['ots','ข้ามไหล่ (OTS)','🫂','over-the-shoulder shot'],['two_shot','สองคนในเฟรม','👥','two-shot'],
 ['pov','มุมมองตัวละคร (POV)','👓','first-person POV shot',{kw:['pov','มุมมองบุคคลที่หนึ่ง']}],
],{cards:true});
G('angle','มุมกล้อง (Angle)','📐',0,[
 ['eye','ระดับสายตา','👁️','eye-level angle'],['low','มุมต่ำ (ดูยิ่งใหญ่)','⬆️','low-angle shot looking up',{kw:['มุมต่ำ']}],
 ['high','มุมสูง (ดูเล็ก)','⬇️','high-angle shot looking down',{kw:['มุมสูง']}],
 ['top','Top-down (บนลงล่าง)','🎯',"bird's-eye top-down view",{kw:['top down','ท็อปวิว','มุมบน']}],
 ['worm','มุมหนอน (ติดพื้น)','🐛',"worm's-eye view"],['dutch','Dutch angle (เอียง)','📐','tilted Dutch angle',{tip:'เอียงกล้องให้เส้นขอบฟ้าเอียง สร้างความรู้สึกไม่มั่นคง'}],
 ['aerial','มุมโดรน / ทางอากาศ','🚁','aerial drone view',{kw:['โดรน','drone','aerial']}],
 ['selfie','มุมเซลฟี่','🤳','selfie-style handheld angle',{kw:['เซลฟี่','selfie']}],['ground','ระดับพื้น','🟫','ground-level angle'],
],{cards:true});
G('movement','การเคลื่อนกล้อง (Movement)','🎥',0,[
 ['static','กล้องนิ่ง','📌','static locked-off camera',{hl:'[Static shot]'}],
 ['pan_l','แพนซ้าย','⬅️','slow pan left',{hl:'[Pan left]'}],['pan_r','แพนขวา','➡️','slow pan right',{hl:'[Pan right]'}],
 ['tilt_u','ทิลต์ขึ้น','⤴️','slow tilt up',{hl:'[Tilt up]'}],['tilt_d','ทิลต์ลง','⤵️','slow tilt down',{hl:'[Tilt down]'}],
 ['dolly_in','ดอลลี่เข้า (Push in)','⏩','slow dolly-in toward the subject',{hl:'[Push in]',kw:['push in','dolly in','ดันกล้องเข้า','ดันเข้า']}],
 ['dolly_out','ดอลลี่ออก (Pull out)','⏪','slow dolly-out revealing the scene',{hl:'[Pull out]',kw:['pull out','ถอยกล้อง']}],
 ['truck_l','เลื่อนข้างซ้าย (Truck)','↔️','lateral trucking move to the left',{hl:'[Truck left]'}],
 ['truck_r','เลื่อนข้างขวา (Truck)','↔️','lateral trucking move to the right',{hl:'[Truck right]'}],
 ['crane_up','เครนขึ้น','🏗️','sweeping crane up',{hl:'[Pedestal up]'}],['crane_down','เครนลง','🔽','crane down',{hl:'[Pedestal down]'}],
 ['orbit','หมุนรอบ (Orbit)','🔄','smooth orbit around the subject',{hl:'[Truck left, Pan right]',kw:['หมุนรอบ','orbit']}],
 ['tracking','ติดตาม (Tracking)','🎯','tracking shot following the subject',{hl:'[Tracking shot]',kw:['ติดตาม','ตามหลัง','tracking']}],
 ['handheld','ถือกล้อง (Handheld)','✋','handheld camera with subtle shake',{hl:'[Shake]',kw:['handheld','แฮนด์เฮลด์']}],
 ['gimbal','กิมบอลนุ่มนวล','🎥','smooth gimbal glide',{hl:'[Tracking shot]'}],
 ['drone_fly','โดรนบินผ่าน','🚁','sweeping drone flyover',{hl:'[Push in, Pedestal up]',kw:['บินโดรน']}],
 ['fpv','FPV โดรนดิ่ง','🛸','fast FPV drone dive',{hl:'[Push in, Tilt down]',kw:['fpv']}],
 ['zoom_in','ซูมเข้า','🔎','slow zoom in',{hl:'[Zoom in]',kw:['ซูมเข้า']}],['zoom_out','ซูมออก','🔭','slow zoom out',{hl:'[Zoom out]',kw:['ซูมออก']}],
 ['crash_zoom','Crash zoom','💥','sudden crash zoom',{hl:'[Zoom in]'}],['whip','Whip pan','💨','fast whip pan',{hl:'[Pan right]'}],
 ['vertigo','Dolly zoom (Vertigo)','🌀','dolly-zoom vertigo effect',{hl:'[Push in, Zoom out]',tip:'ดันกล้องเข้าพร้อมซูมออก ฉากหลังยืด/หด'}],
 ['rack','Rack focus','🎯','rack focus from foreground to background',{hl:'[Static shot]',tip:'เปลี่ยนจุดโฟกัสระหว่างหน้า-หลัง'}],
],{cards:true});
G('lens','เลนส์ / Focal length','🔭',0,[
 ['l14','Ultra-wide 14mm','🌐','an ultra-wide 14mm lens'],['l24','Wide 24mm','🏞️','a wide 24mm lens'],['l35','35mm (สารคดี)','📷','a 35mm lens'],
 ['l50','50mm (ใกล้สายตา)','👁️','a 50mm lens'],['l85','85mm Portrait','🧑‍🎨','an 85mm portrait lens'],
 ['tele','Telephoto 200mm','🔭','a 200mm telephoto lens with compressed background'],['macro','Macro (มาโคร)','🐞','a macro lens',{kw:['มาโคร','macro']}],
 ['fisheye','Fisheye','🐟','a fisheye lens'],['anamorphic','Anamorphic','🎬','an anamorphic lens with oval bokeh',{kw:['anamorphic']}],
 ['tiltshift','Tilt-shift (ของจิ๋ว)','🏘️','a tilt-shift lens for a miniature effect'],
]);
G('dof','ระยะชัด (Depth of field)','🎯',0,[
 ['shallow','ชัดตื้น หลังเบลอ','🌫️','shallow depth of field with creamy bokeh',{kw:['หลังเบลอ','bokeh','โบเก้']}],
 ['deep','ชัดลึกทั้งภาพ','🏔️','deep focus with everything sharp'],['soft','Soft focus ฟุ้ง','☁️','dreamy soft focus'],
 ['split','Split diopter','◐','split-diopter focus'],
]);
G('film','กล้อง / ฟิล์ม (Look)','📼',0,[
 ['arri','ARRI Alexa look','🎥','shot on ARRI Alexa'],['film35','ฟิล์ม 35mm','🎞️','shot on 35mm film',{kw:['ฟิล์ม']}],
 ['film16','ฟิล์ม 16mm เกรนหนา','📽️','shot on grainy 16mm film'],['super8','Super 8','📼','Super 8 home-movie footage'],
 ['vhs','VHS camcorder','📺','VHS camcorder footage',{kw:['vhs']}],['phone','มือถือ (Smartphone)','📱','smartphone footage',{kw:['มือถือ','iphone']}],
 ['gopro','GoPro action cam','🪂','GoPro action-cam footage',{kw:['gopro']}],['cctv','กล้องวงจรปิด','📹','CCTV security-camera footage',{kw:['วงจรปิด','cctv']}],
]);
// ---- Step 5: Light & color
G('lighting','แสง (Lighting)','💡',3,[
 ['natural','แสงธรรมชาตินุ่ม','🌤️','soft natural light'],['harsh_sun','แดดแรงเที่ยงวัน','🔆','harsh midday sunlight',{kw:['แดดแรง','แดดจัด']}],
 ['golden_back','ย้อนแสงสีทอง','🌅','warm golden backlight'],['rim','Rim light (ขอบแสง)','💫','crisp rim lighting'],
 ['three_point','ไฟสตูดิโอ 3 จุด','💡','professional three-point studio lighting'],['high_key','High-key สว่างสะอาด','⬜','bright high-key softbox lighting'],
 ['low_key','Low-key เงาเข้ม','⬛','moody low-key chiaroscuro lighting'],['neon','ไฟนีออน','🟣','vibrant neon lighting',{kw:['นีออน','neon']}],
 ['candle','แสงเทียน / ไฟอุ่น','🕯️','warm flickering candlelight',{kw:['แสงเทียน','เทียน']}],['moon','แสงจันทร์','🌕','cool silver moonlight',{kw:['แสงจันทร์','พระจันทร์']}],
 ['volumetric','ลำแสง God rays','🌤️','volumetric god rays through haze',{kw:['ลำแสง']}],['silhouette','ซิลูเอต (เงาดำ)','👤','dramatic silhouette backlighting',{kw:['ซิลูเอต','silhouette']}],
 ['practical','ไฟในฉาก (Practical)','🏮','warm practical lamps in frame'],['screen','แสงจากจอ','🖥️','cool glow from a screen'],
 ['flare','Lens flare','✴️','anamorphic lens flares'],['leaks','Light leaks','🌈','vintage light leaks'],
],{cards:true});
G('palette','โทนสี / Color grading','🎨',0,[
 ['teal_orange','Teal & Orange','🎨','teal and orange',{sw:['#0f7c8c','#3aa6b9','#f28c28','#f7b267']}],
 ['warm','อบอุ่นสีทอง','🎨','warm golden',{sw:['#f7b267','#f4845f','#c2593a','#7a3e1d'],kw:['โทนอุ่น']}],
 ['cool','เย็นโทนฟ้า','🎨','cool blue',{sw:['#4ea8de','#5e60ce','#3a4f7a','#1b263b'],kw:['โทนเย็น']}],
 ['pastel','พาสเทล','🎨','soft pastel',{sw:['#ffd6e0','#ffefb5','#c1fba4','#bde0fe'],kw:['พาสเทล']}],
 ['vibrant','สีสดจัดจ้าน','🎨','vibrant saturated',{sw:['#ff006e','#ffbe0b','#3a86ff','#06d6a0'],kw:['สีสด']}],
 ['muted','สีหม่น Desaturated','🎨','muted desaturated',{sw:['#8d99ae','#a5a58d','#6b705c','#4a4e69']}],
 ['bw','ขาวดำ','🎨','black and white',{sw:['#0d0d0d','#555','#a8a8a8','#eeeeee'],kw:['ขาวดำ']}],
 ['sepia','ซีเปีย / วินเทจ','🎨','faded sepia vintage',{sw:['#4b2e14','#704214','#c19a6b','#e8d5b0'],kw:['วินเทจ','ย้อนยุค']}],
 ['neon_pc','นีออนชมพู-ฟ้า','🎨','neon pink and cyan',{sw:['#1a0033','#ff2fd6','#9d4edd','#00f0ff']}],
 ['earthy','เอิร์ธโทน','🎨','earthy natural',{sw:['#7f5539','#b08968','#ddb892','#606c38'],kw:['เอิร์ธโทน']}],
 ['red_mono','โมโนโครมแดง','🎨','monochrome red',{sw:['#1a0000','#3d0000','#950101','#ff0000']}],
 ['bleach','Bleach bypass','🎨','bleach-bypass',{sw:['#2f3332','#4a4e4d','#9a9a9a','#c9c5b9']}],
 ['portra','Kodak Portra','🎨','Kodak Portra film',{sw:['#e9c46a','#f4a261','#e76f51','#2a9d8f']}],
 ['fuji','Fujifilm','🎨','Fujifilm-style green-tinted',{sw:['#90be6d','#43aa8b','#f9c74f','#577590']}],
],{swatch:true});
G('mood','อารมณ์ / บรรยากาศ (Mood)','🌈',2,[
 ['heartwarm','อบอุ่นหัวใจ','🥰','heartwarming',{kw:['อบอุ่น']}],['cheerful','สดใสร่าเริง','😄','cheerful and upbeat',{kw:['สดใส','ร่าเริง']}],
 ['romantic','โรแมนติก','💕','romantic',{kw:['โรแมนติก','คู่รัก']}],['melancholy','เศร้า / เหงา','🌧️','melancholic and lonely',{kw:['เหงา','เศร้า']}],
 ['mysterious','ลึกลับ','🕵️','mysterious',{kw:['ลึกลับ']}],['tense','ระทึก / ตึงเครียด','😰','tense and suspenseful',{kw:['ระทึก']}],
 ['horror','น่ากลัว / สยอง','👻','eerie and terrifying',{kw:['สยองขวัญ','น่ากลัว','ผีหลอก']}],['epic','ยิ่งใหญ่ / มหากาพย์','🏔️','epic and grand',{kw:['ยิ่งใหญ่','อลังการ','มหากาพย์']}],
 ['dreamy','ฝันๆ / Ethereal','🦋','dreamy and ethereal',{kw:['ความฝัน','เหมือนฝัน']}],['nostalgic','ถวิลหาอดีต','📻','nostalgic',{kw:['คิดถึงอดีต','nostalgic']}],
 ['luxury','หรูหรา / พรีเมียม','💎','luxurious and premium',{kw:['หรู','พรีเมียม','luxury']}],['calm','สงบ / ผ่อนคลาย','🍃','calm and peaceful',{kw:['สงบ','ผ่อนคลาย','ชิล']}],
 ['energetic','พลังงานสูง','⚡','high-energy',{kw:['มันส์','เร้าใจ']}],['funny','ตลก ขี้เล่น','🤡','playful and comedic'],
 ['dystopian','ดิสโทเปีย','🏭','bleak dystopian'],
],{cards:true});
// ---- Step 6: Style
G('style','สไตล์ภาพ (Visual style)','🎨',2,[
 ['cinematic','Cinematic สมจริง','🎬','cinematic photorealistic',{kw:['สมจริง','cinematic'],real:1}],
 ['documentary','สารคดี / Raw','📹','raw handheld documentary',{real:1}],
 ['anime','อนิเมะ 2D','🌸','hand-drawn 2D anime',{kw:['อนิเมะ','การ์ตูนญี่ปุ่น','anime'],toon:1}],
 ['pastoral_anime','อนิเมะทุ่งหญ้าสีน้ำ (แนวจิบลิ)','🍃','hand-painted pastoral anime with lush watercolor backgrounds',{kw:['จิบลิ','ghibli'],toon:1}],
 ['3d_anim','3D แอนิเมชัน (แนวพิกซาร์)','🧸','polished 3D animated feature film',{kw:['3d','พิกซาร์','pixar'],toon:1}],
 ['clay','Claymation ดินน้ำมัน','🟠','claymation',{kw:['ดินน้ำมัน','claymation'],toon:1}],
 ['stopmotion','Stop-motion','🧱','handcrafted stop-motion',{kw:['stop motion','สต็อปโมชัน'],toon:1}],
 ['watercolor','สีน้ำ','🖌️','watercolor painting',{kw:['ภาพสีน้ำ'],toon:1}],['oil','ภาพสีน้ำมัน','🖼️','impressionist oil painting',{toon:1}],
 ['pixel','Pixel art','👾','retro pixel art',{kw:['pixel','พิกเซล'],toon:1}],['lowpoly','Low-poly 3D','🔺','low-poly 3D',{toon:1}],
 ['comic','คอมิก / Graphic novel','💥','graphic novel comic',{kw:['คอมิก','comic'],toon:1}],['cyberpunk','Cyberpunk','🌆','cyberpunk'],
 ['vaporwave','Vaporwave','🌴','vaporwave aesthetic'],['noir','ฟิล์มนัวร์','🕶️','classic film noir',{kw:['นัวร์','noir']}],
 ['storybook','สมมาตรพาสเทล (แนวเวส แอนเดอร์สัน)','🎀','symmetrical whimsical pastel storybook'],
 ['surreal','เหนือจริง (Surreal)','🫠','surreal dreamlike',{kw:['เหนือจริง','surreal']}],['papercut','กระดาษตัด','✂️','layered paper cut-out',{toon:1}],
 ['isometric','Isometric diorama','🧊','isometric miniature diorama',{toon:1}],['game3d','เกม 3D (Unreal)','🕹️','Unreal Engine 5 real-time render'],
 ['sketch','ลายเส้นสเก็ตช์','✏️','pencil sketch line art',{toon:1}],
],{cards:true});
G('quality','Quality modifiers','💎',6,[
 ['k4','4K ละเอียด','📺','ultra-detailed 4K'],['detailed','Texture ละเอียด','🔬','highly detailed textures'],['sharp','คมชัด','🔪','sharp focus'],
 ['grain','Film grain','🎞️','subtle film grain'],['hdr','HDR','🌈','HDR dynamic range'],['physics','ฟิสิกส์สมจริง','⚙️','realistic physics'],
 ['motion','เคลื่อนไหวเป็นธรรมชาติ','🌊','natural fluid motion'],['anatomy','สรีระถูกต้อง','🖐️','consistent accurate anatomy'],
 ['photoreal','Photorealistic','📸','photorealistic'],['grade','เกรดสีมืออาชีพ','🎚️','professional color grading'],
]);
// ---- Step 7: Pacing / editing
G('pacing','จังหวะ (Pacing)','🥁',0,[
 ['slow','ช้า ละเมียด','🐢','slow, contemplative pacing'],['steady','ปานกลาง','🚶','steady natural pacing'],
 ['fast','เร็ว เร้าใจ','⚡','fast, energetic pacing',{kw:['รวดเร็ว']}],['realtime','ต่อเนื่องเรียลไทม์','⏱️','real-time continuous action'],
 ['montage','มอนทาจ','🧩','rhythmic montage pacing',{kw:['มอนทาจ','montage']}],
]);
G('transition','การตัดต่อ / Transitions','✂️',2,[
 ['oner','ช็อตเดียวต่อเนื่อง (One-take)','🎯','a single continuous take',{kw:['one take','ลองเทค']}],['hard_cut','Hard cut','✂️','hard cuts'],
 ['match','Match cut','🔗','match cuts'],['jump','Jump cut','⏭️','jump cuts'],['dissolve','Cross-dissolve','🌫️','soft cross-dissolves'],
 ['whip_tr','Whip-pan transition','💨','whip-pan transitions'],['morph','Morph transition','🫧','seamless morph transitions'],['fade','Fade to black','⬛','ending with a fade to black'],
]);
// ---- Step 8: Audio
G('voice','เสียงผู้บรรยาย (Voice-over)','🎙️',0,[
 ['deep_male','ชายเสียงทุ้ม','🧔','a deep male voice'],['soft_female','หญิงนุ่มนวล','👩','a soft female voice'],['child_v','เสียงเด็ก','🧒',"a child's voice"],
 ['doc_narr','ผู้บรรยายสารคดี','🎙️','a calm documentary narrator'],['hype','พิธีกรเร้าใจ','📣','an energetic announcer'],
]);
G('music','ดนตรีประกอบ','🎼',0,[
 ['lofi','Lo-fi chill','🎧','lo-fi chill beats',{kw:['lofi','lo-fi']}],['orchestral','ออร์เคสตรายิ่งใหญ่','🎻','an epic orchestral score'],
 ['piano','เปียโนเศร้า','🎹','soft melancholic piano',{kw:['เปียโน']}],['edm','EDM','🔊','a pumping EDM track',{kw:['edm']}],
 ['lukthung','ลูกทุ่ง / หมอลำ','🪕','upbeat Thai luk thung and mor lam music',{kw:['ลูกทุ่ง','หมอลำ']}],
 ['thai_classic','ไทยเดิม (ระนาด)','🎶','traditional Thai ranat xylophone music',{kw:['ระนาด','ไทยเดิม']}],
 ['jazz','แจ๊ส','🎷','smooth jazz',{kw:['แจ๊ส','jazz']}],['synthwave','Synthwave','🌆','retro synthwave'],['acoustic','กีตาร์โปร่ง','🎸','warm acoustic guitar'],
 ['hiphop','ฮิปฮอป','🎤','a laid-back hip-hop beat'],['no_music','ไม่มีดนตรี','🔇','no music'],
]);
G('sfx','เสียงประกอบ (SFX)','💥',4,[
 ['rain_s','เสียงฝน','🌧️','rain pattering on glass'],['thunder','ฟ้าร้อง','⚡','distant rolling thunder'],['traffic','เสียงรถ/เมือง','🚕','city traffic hum'],
 ['waves','คลื่นทะเล','🌊','waves crashing'],['birds','นกร้อง','🐦','birdsong'],['steps','ฝีเท้า','👣','footsteps'],['sizzle','เสียงทอด ซู่ซ่า','🍳','oil sizzling'],
 ['can','เปิดกระป๋อง','🥤','a can cracking open with fizz'],['engine','เครื่องยนต์','🏎️','an engine roaring'],['whoosh','Whoosh','💨','cinematic whooshes'],
 ['heart','หัวใจเต้น','💓','a slow heartbeat'],['cheer','เสียงเชียร์','📣','a crowd cheering'],['sword','ดาบปะทะ','⚔️','metallic sword clashes'],
]);
G('ambience','บรรยากาศเสียง (Ambience)','🌫️',0,[
 ['quiet','เงียบสงบ','🤫','quiet room tone'],['cafe_a','ร้านกาแฟ','☕','soft cafe chatter and clinking cups'],['market_a','ตลาดคึกคัก','🛒','bustling market chatter'],
 ['forest_n','ป่ากลางคืน','🦗','night forest crickets'],['wind_a','ลมพัดเบาๆ','🍃','a soft breeze'],['city_n','เมืองยามค่ำ','🌃','distant city ambience at night'],
]);
// ---- Step 9: Text / negatives
G('text_style','สไตล์ข้อความบนจอ','🔤',0,[
 ['bold_sans','ตัวหนา Sans-serif','🅰️','bold clean sans-serif type'],['neon_sign','ป้ายไฟนีออน','💡','glowing neon-sign lettering'],
 ['handwritten','ลายมือ','✍️','handwritten lettering'],['kinetic','Kinetic typography','🔤','animated kinetic typography'],['subtitle','ซับด้านล่าง','💬','subtitle-style text at the bottom'],
]);
G('negative','สิ่งที่ต้องหลีกเลี่ยง (Negative)','🚫',16,[
 ['blurry','ภาพเบลอ','🌫️','blurry'],['distorted','ภาพบิดเบี้ยว','🫠','distorted, warped'],['hands','มือ/นิ้วผิดรูป','🖐️','deformed hands, extra fingers'],
 ['faces','หน้าผิดรูป','🙃','deformed faces'],['bad_text','ตัวอักษรเพี้ยน','🔣','garbled text'],['watermark','ลายน้ำ / โลโก้','©️','watermark, logo'],
 ['shaky','กล้องสั่นมาก','📳','excessive camera shake'],['flicker','ภาพกระพริบ','💡','flickering'],['cartoon','ดูเป็นการ์ตูน','🧸','cartoonish, CGI look'],
 ['too_real','สมจริงเกินไป','📸','photorealistic, live-action'],['extra_people','คนแปลกหน้าในฉาก','👥','extra people in background'],
 ['lowq','คุณภาพต่ำ','📉','low quality, compression artifacts'],['subs','ซับไตเติล','💬','subtitles, captions'],['borders','ขอบดำ','⬛','black borders, letterboxing'],
 ['morph_bad','วัตถุละลาย/เปลี่ยนรูป','🫧','morphing objects'],['jitter','เคลื่อนไหวกระตุก','📉','jittery unnatural motion'],
]);
/* ============================================================
   2) STEPS (wizard)
   ============================================================ */
const STEPS = [
 {id:'basics',e:'🎯',th:'พื้นฐาน',d:'ประเภทวิดีโอ วัตถุประสงค์ แพลตฟอร์ม ความยาว และ frame rate',c:'#8b7bff',items:['video_type','purpose','platform','duration','fps']},
 {id:'subject',e:'🧑',th:'ตัวละคร / Subject',d:'ใครหรืออะไร หน้าตา การแต่งกาย สีหน้า และการกระทำ',c:'#ff6b9a',items:[
   {t:'text',f:'subject',label:'Subject หลัก',hint:'แนะนำภาษาอังกฤษ หรือพิมพ์ไทยแล้วให้ AI แปล',ph:'เช่น a sleek glass perfume bottle / หญิงสาวผมยาวถือร่มสีแดง'},
   'count','age','gender','ethnicity','features','clothing','expression','action','interaction']},
 {id:'setting',e:'🌍',th:'ฉาก / สถานที่',d:'สถานที่ เวลา สภาพอากาศ ฤดู และยุคสมัย',c:'#2ec4b6',items:[
   'location',{t:'text',f:'scene_detail',label:'รายละเอียดฉาก / Props',hint:'สิ่งของ พื้นผิว องค์ประกอบในฉาก',ph:'เช่น steam rising from the bowl, paper lanterns swaying'},'time','weather','season','era']},
 {id:'camera',e:'🎥',th:'กล้อง',d:'ขนาดภาพ มุมกล้อง การเคลื่อนกล้อง เลนส์ ระยะชัด และ look ของกล้อง',c:'#4da3ff',items:['shot','angle','movement','lens','dof','film']},
 {id:'light',e:'💡',th:'แสง สี อารมณ์',d:'การจัดแสง โทนสี/เกรดสี และบรรยากาศโดยรวม',c:'#ffb547',items:['lighting','palette','mood']},
 {id:'style',e:'🎨',th:'สไตล์ภาพ',d:'สไตล์หลัก แรงบันดาลใจ และ quality modifiers',c:'#c77dff',items:[
   'style',{t:'text',f:'style_ref',label:'Reference / แรงบันดาลใจ',hint:'บรรยายลักษณะแทนการอ้างชื่อศิลปิน',ph:'เช่น moody neon-soaked 90s Hong Kong cinema feel'},'quality']},
 {id:'edit',e:'🎬',th:'จังหวะ & Storyboard',d:'จังหวะ การตัดต่อ และการแบ่ง shot หลายช็อต',c:'#5ce1e6',items:['pacing','transition',{t:'shots'}]},
 {id:'audio',e:'🔊',th:'เสียง',d:'บทพูด เสียงบรรยาย ดนตรี SFX (สำหรับโมเดลที่รองรับเสียง)',c:'#7bd88f',items:[
   {t:'audioNote'},{t:'dialogue'},'voice',{t:'text',f:'vo',label:'บทบรรยาย (Voice-over)',hint:'',ph:'เช่น Every journey begins with a single step.'},'music','sfx','ambience']},
 {id:'final',e:'🛡️',th:'ข้อความ ข้อห้าม ความต่อเนื่อง',d:'ข้อความบนจอ negative prompt และ character consistency / seed',c:'#ff7a59',items:[
   {t:'text',f:'onscreen',label:'ข้อความบนจอ (On-screen text)',hint:'ตัวอักษรไทยมักเรนเดอร์เพี้ยน แนะนำใส่ตอนตัดต่อ',ph:'เช่น SUMMER SALE 50%'},'text_style','negative',
   {t:'text',f:'neg_custom',label:'Negative เพิ่มเติม (พิมพ์เอง)',hint:'',ph:'เช่น umbrellas, cars in background'},{t:'consistency'}]},
];
const G2S = {};
STEPS.forEach(s => s.items.forEach(it => { if (typeof it === 'string') G2S[it] = s; else if (it.f) G2S[it.f] = s; }));
G2S.shots = G2S.pacing; G2S.dialogue = G2S.music; G2S.vo = G2S.music; G2S.consistency = G2S.negative; G2S.idea = STEPS[0];
const OPT = {}; Object.values(GROUPS).forEach(g => g.opts.forEach(o => OPT[g.id + '.' + o.id] = o));

/* ============================================================
   3) MODEL PROFILES  (ค่าตั้งต้น — ปรับได้ใน config / ตรวจสอบกับเอกสารล่าสุดของผู้ให้บริการ)
   ============================================================ */
const MODELS = [
 {id:'veo',name:'Veo 3',v:'Google',fmt:'paragraph',audio:true,neg:'field',max:1500,dur:8,note:'ย่อหน้าภาษาธรรมชาติ: กล้อง → subject → action → ฉาก → สไตล์/แสง → mood แล้วตามด้วยบล็อกเสียง (บทพูดในเครื่องหมายคำพูด, SFX:, Ambient noise:, Music:)'},
 {id:'sora',name:'Sora 2',v:'OpenAI',fmt:'structured',audio:true,neg:'inline',max:2000,dur:20,note:'Prose บรรยายฉาก + บล็อก Cinematography / Mood / Actions / Dialogue — ไม่มีช่อง negative จึงแปลงเป็นบรรทัด "Avoid:"'},
 {id:'kling',name:'Kling',v:'Kuaishou',fmt:'kling',audio:'partial',neg:'field',max:2500,dur:10,note:'สูตร Subject + Movement + Scene + Camera language + Lighting + Atmosphere เขียนกระชับ มีช่อง negative แยก (เสียงขึ้นกับเวอร์ชัน)'},
 {id:'runway',name:'Runway Gen-4',v:'Runway',fmt:'runway',audio:false,neg:'none',max:1000,dur:10,note:'รูปแบบ [Camera movement]: [Establishing scene]. [Additional details]. — ไม่ควรใช้คำปฏิเสธใน prompt จึงตัด negative ออก'},
 {id:'pika',name:'Pika',v:'Pika Labs',fmt:'pika',audio:false,neg:'field',max:500,dur:10,note:'prompt สั้นกระชับ ใส่เฉพาะสาระหลัก + negative แยกช่อง'},
 {id:'luma',name:'Luma Ray',v:'Luma AI',fmt:'luma',audio:false,neg:'none',max:1500,dur:10,note:'ภาษาธรรมชาติ ปิดท้ายด้วยคำสั่งกล้อง (camera keyword) — ไม่มี negative'},
 {id:'hailuo',name:'Hailuo',v:'MiniMax',fmt:'hailuo',audio:false,neg:'inline',max:2000,dur:10,note:'ภาษาธรรมชาติ + คำสั่งกล้องในวงเล็บเหลี่ยมแบบ Director mode เช่น [Push in], [Pan left]'},
 {id:'tags',name:'Tags',v:'Wan / SD-based',fmt:'tags',audio:false,neg:'field',max:1000,dur:5,note:'tag คั่นด้วย comma + น้ำหนัก (keyword:1.2) สำหรับโมเดล open-source / ComfyUI'},
];
const MOD = Object.fromEntries(MODELS.map(m => [m.id, m]));

/* ============================================================
   4) PRESETS
   ============================================================ */
const PRESETS = [
 {id:'p_product',e:'🛍️',th:'โฆษณาสินค้า (น้ำหอม)',model:'veo',s:{
   subject:'a sleek glass perfume bottle with a brushed gold cap',scene_detail:'water droplets on black marble, soft mist swirling around the bottle',
   sel:{video_type:['product_ad'],purpose:['brand','sell'],platform:['tiktok'],duration:['d8'],fps:['slowmo'],count:['product'],action:['rotate'],location:['studio'],
     shot:['cu'],angle:['low'],movement:['orbit'],lens:['macro'],dof:['shallow'],lighting:['rim','low_key','volumetric'],palette:['warm'],mood:['luxury'],
     style:['cinematic'],quality:['k4','detailed','sharp'],pacing:['slow'],transition:['oner'],music:['piano'],sfx:['whoosh'],ambience:['quiet'],
     negative:['watermark','bad_text','distorted','lowq','morph_bad']}}},
 {id:'p_travel',e:'✈️',th:'Vlog ท่องเที่ยว',model:'veo',s:{
   subject:'a cheerful traveler with a straw hat and a small backpack',scene_detail:'wooden boats piled with tropical fruit, vendors in bamboo hats',
   sel:{video_type:['travel_vlog'],purpose:['inspire'],platform:['tiktok'],duration:['d8'],fps:['fps24'],count:['one'],age:['young'],gender:['female'],ethnicity:['thai'],
     clothing:['casual'],expression:['smile'],action:['walk','look_cam'],location:['market'],time:['golden'],weather:['clear'],shot:['medium'],angle:['eye'],
     movement:['tracking'],lens:['l24'],dof:['shallow'],film:['phone'],lighting:['natural','golden_back'],palette:['vibrant'],mood:['cheerful'],style:['cinematic'],
     quality:['k4','motion'],pacing:['fast'],transition:['whip_tr'],music:['acoustic'],ambience:['market_a'],negative:['blurry','extra_people','watermark']},
   dialogue:[{sp:'The traveler',line:'สวัสดีค่ะ! วันนี้พามาเที่ยวตลาดน้ำกันค่ะ',tone:'excitedly',thai:true}]}},
 {id:'p_drama',e:'🎭',th:'ดราม่าหนังสั้น',model:'sora',s:{
   subject:'a woman holding an old faded photograph',scene_detail:'a cup of cold tea on the windowsill, raindrops racing down the glass',
   sel:{video_type:['short_film'],purpose:['story'],platform:['youtube'],duration:['d8'],fps:['fps24'],count:['one'],age:['middle'],gender:['female'],ethnicity:['thai'],
     expression:['sad'],action:['gaze'],location:['window'],time:['night'],weather:['rain'],shot:['mcu'],angle:['eye'],movement:['dolly_in'],lens:['anamorphic'],
     dof:['shallow'],film:['film35'],lighting:['practical','low_key'],palette:['cool'],mood:['melancholy','nostalgic'],style:['cinematic'],quality:['grain','detailed'],
     pacing:['slow'],transition:['dissolve'],music:['piano'],sfx:['rain_s','thunder'],negative:['faces','hands','flicker']},
   shots:[{d:3,size:'ecu',mv:'static',desc:'trembling fingers holding the old photograph'},{d:3,size:'mcu',mv:'dolly_in',desc:'a single tear rolls down her cheek'},{d:2,size:'wide',mv:'dolly_out',desc:'she sits alone by the rain-streaked window'}]}},
 {id:'p_anime',e:'⚔️',th:'Anime action',model:'kling',s:{
   subject:'a young swordsman with spiky silver hair wielding a glowing blue katana',scene_detail:'sparks and rain droplets frozen mid-air, holographic billboards',
   sel:{video_type:['trailer'],purpose:['entertain'],platform:['youtube'],duration:['d10'],fps:['fps24'],count:['one'],age:['teen'],gender:['male'],clothing:['techwear'],
     expression:['determined'],action:['fight','jump'],location:['cyber_city'],time:['night'],weather:['rain'],shot:['full'],angle:['low'],movement:['tracking'],
     lens:['l24'],lighting:['neon','rim'],palette:['neon_pc'],mood:['epic','energetic'],style:['anime'],quality:['detailed','motion'],pacing:['fast'],
     transition:['hard_cut'],music:['edm'],sfx:['sword','whoosh'],negative:['too_real','distorted','faces','jitter']}}},
 {id:'p_food',e:'🍜',th:'รีวิวอาหาร',model:'veo',s:{
   subject:'a steaming bowl of spicy tom yum goong with giant river prawns',scene_detail:'chopsticks lifting a juicy prawn, steam rising, chili oil glistening',
   sel:{video_type:['food'],purpose:['sell'],platform:['tiktok'],duration:['d8'],fps:['slowmo'],count:['product'],location:['street_food'],time:['night'],
     shot:['cu'],angle:['high'],movement:['dolly_in'],lens:['macro'],dof:['shallow'],lighting:['practical','rim'],palette:['warm'],mood:['heartwarm'],
     style:['cinematic'],quality:['k4','detailed'],pacing:['steady'],music:['lukthung'],sfx:['sizzle'],ambience:['market_a'],negative:['blurry','watermark','lowq','bad_text']}}},
 {id:'p_mv',e:'🎵',th:'Music video นีออน',model:'runway',s:{
   subject:'a dancer in a flowing red silk dress',scene_detail:'puddles reflecting neon signs, light haze',
   sel:{video_type:['music_video'],purpose:['entertain'],platform:['tiktok'],duration:['d10'],fps:['slowmo'],count:['one'],gender:['female'],action:['dance'],
     location:['rooftop'],time:['night'],weather:['after_rain'],shot:['full'],angle:['low'],movement:['orbit'],lens:['l35'],lighting:['neon','flare'],
     palette:['neon_pc'],mood:['energetic','dreamy'],style:['cinematic'],quality:['motion'],pacing:['montage'],transition:['match'],music:['synthwave']}}},
];

/* ============================================================
   5) STATE
   ============================================================ */
const blank = () => ({idea:'',subject:'',scene_detail:'',style_ref:'',vo:'',onscreen:'',neg_custom:'',sel:{},custom:{},locks:[],ai:{},
  shots:[],dialogue:[],seed:'',charName:'',charRef:false,autoNeg:true,model:'veo',preset:null,enhanced:null});
let state = blank();
const clone = o => JSON.parse(JSON.stringify(o));

/* ============================================================
   6) HELPERS
   ============================================================ */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TH_RE = /[\u0E00-\u0E7F]/;
const isTh = s => TH_RE.test(s || '');
const M = (g, t) => t ? `\u0001${g}\u0002${t}\u0003` : '';
const strip = s => String(s).replace(/\u0001[^\u0002]*\u0002/g, '').replace(/\u0003/g, '');
const capM = s => s ? s.replace(/^(\u0001[^\u0002]*\u0002)?([a-z])/, (m, a, b) => (a || '') + b.toUpperCase()) : s;
const art = w => w ? ((/^[aeiou]/i.test(w) && !/^(uni|eu|one)/i.test(w)) ? 'an ' : 'a ') + w : '';
const stripPrep = s => s.replace(/^(in|on|at|inside|beside|against|among|deep|under|with|during)\s+(the\s+|a\s+|an\s+)?/i, '').replace(/^(a|an)\s+/i, '');
const joinList = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const S = g => state.sel[g] || [];
const sel = g => S(g).map(id => OPT[g + '.' + id]).filter(Boolean);
const has = (g, ids) => S(g).some(i => ids.includes(i));
const any = g => S(g).length > 0 || !!(state.custom[g] || '').trim();
function ph(g, o = {}) {
  let parts = sel(g).map(x => (o.key && x[o.key]) || x.en).filter(Boolean);
  const c = tr((state.custom[g] || '').trim()); if (c) parts.push(c);
  if (o.strip) parts = parts.map(stripPrep);
  return o.join ? parts.join(o.join) : joinList(parts);
}
const pm = (g, o) => M(g, ph(g, o));

/* ============================================================
   7) PROMPT COMPILER  (spec → model-specific prompt)
   ============================================================ */
function buildParts(m) {
  const P = {};
  const vt = ph('video_type');
  P.type = vt ? M('video_type', art(vt)) : '';
  P.purpose = pm('purpose'); P.comp = pm('platform'); P.fps = pm('fps');
  const st = tr((state.subject || '').trim());
  const age = sel('age')[0], gen = sel('gender')[0], eth = sel('ethnicity')[0], cnt = sel('count')[0];
  let noun = gen ? gen.en : '';
  if (age && age.id === 'child') noun = gen ? ({female:'girl', male:'boy'}[gen.id] || 'child') : 'child';
  else if (age && age.id === 'teen') noun = gen ? ({female:'teenage girl', male:'teenage boy'}[gen.id] || 'teenager') : 'teenager';
  const adj = [(age && !['child','teen'].includes(age.id)) ? age.en : '', eth ? eth.en : ''].filter(Boolean).join(' ');
  const who = noun ? (adj + ' ' + noun).trim() : (adj ? adj + ' person' : '');
  let main;
  if (st) main = M('subject', st) + (who ? ' ' + M('age', '(' + who + ')') : '');
  else if (who) main = (cnt && ['two','group','crowd'].includes(cnt.id)) ? M('count', cnt.en + ' including ' + art(who)) : M('age', art(who));
  else if (cnt) main = M('count', cnt.en);
  else main = '';
  if (state.charName.trim()) main = M('consistency', state.charName.trim()) + (main ? ', ' + main : '');
  const feats = ph('features'), cloth = ph('clothing');
  P.subject = main + (feats ? ' ' + M('features', 'with ' + feats) : '') + (cloth ? ', ' + M('clothing', 'wearing ' + cloth) : '');
  P.subjectT = [st, who, feats, cloth].map((x, i) => x ? M(['subject','age','features','clothing'][i], x) : '').filter(Boolean).join(', ');
  if (!st && !who && cnt) P.subjectT = M('count', stripPrep(cnt.en)) + (P.subjectT ? ', ' + P.subjectT : '');
  P.expr = pm('expression'); P.action = pm('action'); P.inter = pm('interaction');
  P.actAll = [P.expr, P.action, P.inter].filter(Boolean).join(', ');
  const loc = ph('location'), era = ph('era'), season = ph('season');
  P.setting = [loc ? M('location', loc) : '', era ? M('era', 'with a ' + era + ' feel') : '', season ? M('season', season) : ''].filter(Boolean).join(', ');
  P.settingT = [pm('location', {strip:1}), era ? M('era', era + ' era') : '', pm('season', {strip:1})].filter(Boolean).join(', ');
  P.detail = M('scene_detail', tr((state.scene_detail || '').trim()));
  P.time = pm('time'); P.timeT = pm('time', {strip:1});
  P.weather = pm('weather'); P.weatherT = pm('weather', {strip:1, join:', '});
  P.shot = pm('shot'); P.angle = pm('angle'); P.move = pm('movement'); P.moveHL = M('movement', ph('movement', {key:'hl', join:' '}));
  P.lens = pm('lens'); P.lensT = pm('lens', {strip:1}); P.dof = pm('dof'); P.film = pm('film');
  P.light = pm('lighting'); P.lightT = pm('lighting', {join:', '}); P.palette = pm('palette'); P.mood = pm('mood', {join:', '});
  P.style = pm('style'); P.styleRef = M('style_ref', tr((state.style_ref || '').trim())); P.quality = pm('quality', {join:', '});
  P.pacing = pm('pacing'); P.trans = pm('transition');
  let t = 0;
  P.shots = state.shots.filter(s => s.desc || s.size || s.mv).map((s, i) => {
    const d = +s.d || 2, a = t, b = t + d; t = b;
    const bits = [s.size ? (OPT['shot.' + s.size] || {}).en : '', s.mv ? (OPT['movement.' + s.mv] || {}).en : ''].filter(Boolean).join(', ');
    return {i: i + 1, a, b, bits, desc: tr((s.desc || '').trim()), hl: s.mv ? (OPT['movement.' + s.mv] || {}).hl : ''};
  });
  P.dialogue = state.dialogue.filter(d => d.line && d.line.trim()).map(d => ({sp: (d.sp || '').trim() || 'The character', line: d.thai ? d.line.trim() : tr(d.line.trim()), tone: d.tone, thai: d.thai}));
  P.vo = tr((state.vo || '').trim()); P.voice = ph('voice');
  P.music = pm('music'); P.sfx = pm('sfx', {join:', '}); P.amb = pm('ambience');
  P.hasAudio = !!(P.dialogue.length || P.vo || P.music || P.sfx || P.amb);
  const os = (state.onscreen || '').trim();
  P.onscreen = os ? M('onscreen', `on-screen text reads "${os}"`) + (any('text_style') ? ' ' + M('text_style', 'in ' + ph('text_style')) : '') : '';
  P.consist = state.charName.trim() ? M('consistency', `Keep ${state.charName.trim()} visually consistent in every frame${state.charRef ? ', matching the reference image' : ''}`) : (state.charRef ? M('consistency', 'Match the character reference image exactly') : '');
  P.neg = negList();
  return P;
}
function autoNeg() {
  const out = [];
  if (!state.autoNeg) return out;
  if (sel('style').some(o => o.real)) out.push('cartoonish, CGI look');
  if (sel('style').some(o => o.toon)) out.push('photorealistic, live-action');
  if (any('count') && !has('count', ['none','product','animal'])) out.push('deformed hands');
  if (!(state.onscreen || '').trim()) out.push('random text');
  return out;
}
function negList() {
  const base = sel('negative').map(o => o.en);
  const c = tr((state.neg_custom || '').trim());
  const all = [...base, ...autoNeg(), ...(c ? [c] : [])].join(', ').split(/\s*,\s*/).filter(Boolean);
  return [...new Set(all)];
}
function audioLines(P, m, style) {
  if (!m.audio || !P.hasAudio) return [];
  const L = [];
  P.dialogue.forEach(d => L.push(M('dialogue', `${d.sp} says${d.tone ? ' ' + d.tone : ''}: "${d.line}"${d.thai ? ' (spoken in Thai)' : ''}`)));
  if (P.vo) L.push(M('vo', `Voice-over${P.voice ? ' by ' + P.voice : ''}: "${P.vo}"`));
  if (P.sfx) L.push((style === 'veo' ? 'SFX: ' : 'Sound effects: ') + P.sfx);
  if (P.amb) L.push((style === 'veo' ? 'Ambient noise: ' : 'Ambience: ') + P.amb);
  if (P.music) L.push('Music: ' + P.music);
  return L;
}
function sentence(s) { s = (s || '').trim(); if (!s) return ''; s = capM(s); return /[.!?"]$/.test(strip(s)) ? s : s + '.'; }
function sceneSentence(P, withCam = true) {
  const cam = withCam ? [P.shot, P.angle].filter(Boolean).join(', ') : '';
  const subj = P.subject || 'the scene';
  let s = cam ? cam + ' of ' + subj : subj;
  if (P.actAll) s += ', ' + P.actAll;
  if (P.setting) s += ' ' + P.setting;
  if (P.time) s += ' ' + P.time;
  if (P.weather) s += ', ' + P.weather;
  return (P.subject || cam || P.setting) ? sentence(s) : '';
}
function openerSentence(P) { const b = [P.type, P.purpose, P.comp].filter(Boolean); return b.length ? sentence(b.join(', ')) : ''; }
function styleSentence(P) {
  const a = [];
  if (P.style) a.push(sentence(P.style + ' style' + (P.film ? ', ' + P.film : '')));
  else if (P.film) a.push(sentence(P.film));
  if (P.styleRef) a.push(sentence('Inspired by ' + P.styleRef));
  return a.join(' ');
}
function lightSentence(P) {
  if (P.light) return sentence('Lit by ' + P.light + (P.palette ? ', with ' + P.palette + ' color grading' : ''));
  return P.palette ? sentence(P.palette + ' color grading') : '';
}
function lensSentence(P) { const b = [P.lens ? 'shot with ' + P.lens : '', P.dof, P.fps].filter(Boolean); return b.length ? sentence(b.join(', ')) : ''; }
function shotsText(P, mode) {
  if (!P.shots.length) return '';
  const one = s => `Shot ${s.i} (${s.a}–${s.b}s): ${[s.bits, s.desc].filter(Boolean).join(' — ')}`;
  if (mode === 'lines') return P.shots.map(s => '- ' + M('shots', one(s))).join('\n');
  return M('shots', 'Sequence: ' + P.shots.map(one).join('; ')) + '.';
}
const FORMATTERS = {
  paragraph(P, m) {
    const ed = [P.pacing, P.trans].filter(Boolean);
    const a = [openerSentence(P), sceneSentence(P), P.move ? sentence('Camera movement: ' + P.move) : '', P.detail ? sentence(P.detail) : '', styleSentence(P), lightSentence(P), lensSentence(P),
      P.mood ? sentence('The mood is ' + P.mood) : '', ed.length ? sentence(ed.join(', ')) : '',
      shotsText(P), P.onscreen ? sentence(P.onscreen) : '', P.consist ? sentence(P.consist) : '', P.quality ? sentence(P.quality) : ''].filter(Boolean);
    let out = a.join(' ');
    const au = audioLines(P, m, 'veo');
    if (au.length) out += '\n\nAudio: ' + au.map(x => sentence(x)).join(' ');
    return out;
  },
  structured(P, m) {
    const prose = [openerSentence(P), sceneSentence(P, false), P.detail ? sentence(P.detail) : '', styleSentence(P), P.consist ? sentence(P.consist) : ''].filter(Boolean).join(' ');
    const cin = [];
    const camShot = [P.shot, P.angle].filter(Boolean).join(', ');
    if (camShot) cin.push('Camera shot: ' + camShot);
    if (P.move) cin.push('Camera motion: ' + P.move);
    const lens = [P.lens, P.dof].filter(Boolean).join(', '); if (lens) cin.push('Lens: ' + lens);
    if (P.light) cin.push('Lighting: ' + P.lightT);
    if (P.palette) cin.push('Color palette: ' + P.palette);
    const fmt = [P.fps, P.comp, P.pacing, P.trans].filter(Boolean).join(', '); if (fmt) cin.push('Format & pacing: ' + fmt);
    if (P.quality) cin.push('Quality: ' + P.quality);
    let out = prose;
    if (cin.length) out += '\n\nCinematography:\n' + cin.join('\n');
    if (P.mood) out += '\n\nMood: ' + P.mood;
    const acts = P.shots.length ? shotsText(P, 'lines') : (P.actAll ? '- ' + capM(P.actAll) : '');
    if (acts) out += '\n\nActions:\n' + acts;
    if (P.onscreen) out += '\n\nText: ' + capM(P.onscreen);
    if (m.audio && P.hasAudio) {
      const dl = [...P.dialogue.map(d => '- ' + M('dialogue', `${d.sp}${d.tone ? ' (' + d.tone + ')' : ''}: "${d.line}"${d.thai ? ' (spoken in Thai)' : ''}`)), ...(P.vo ? ['- ' + M('vo', `Narrator${P.voice ? ' (' + P.voice + ')' : ''}: "${P.vo}"`)] : [])];
      if (dl.length) out += '\n\nDialogue:\n' + dl.join('\n');
      const snd = [P.music ? 'music: ' + P.music : '', P.sfx ? 'effects: ' + P.sfx : '', P.amb ? 'ambience: ' + P.amb : ''].filter(Boolean);
      if (snd.length) out += '\n\nSound: ' + snd.join('; ');
    }
    if (m.neg === 'inline' && P.neg.length) out += '\n\nAvoid: ' + M('negative', P.neg.join(', '));
    return out;
  },
  kling(P, m) {
    const a = [];
    let s1 = [P.subject, P.actAll].filter(Boolean).join(', ');
    const sc = [P.setting, P.time, P.weather].filter(Boolean).join(', ');
    if (sc) s1 += (s1 ? ', ' : '') + sc;
    if (s1) a.push(sentence(s1));
    if (P.detail) a.push(sentence(P.detail));
    const cam = [P.shot, P.angle, P.move, P.lens, P.dof, P.fps].filter(Boolean).join(', '); if (cam) a.push(sentence(cam));
    const li = [P.lightT, P.palette ? P.palette + ' tones' : ''].filter(Boolean).join(', '); if (li) a.push(sentence(li));
    if (P.mood) a.push(sentence(P.mood + ' atmosphere'));
    const st = [P.style ? P.style + ' style' : '', P.film, P.styleRef, P.quality].filter(Boolean).join(', '); if (st) a.push(sentence(st));
    const ed = [P.pacing, P.trans].filter(Boolean).join(', '); if (ed) a.push(sentence(ed));
    if (P.shots.length) a.push(shotsText(P));
    if (P.onscreen) a.push(sentence(P.onscreen));
    if (P.consist) a.push(sentence(P.consist));
    let out = a.join(' ');
    const au = audioLines(P, m, 'kling'); if (au.length) out += '\n\nAudio: ' + au.map(x => sentence(x)).join(' ');
    return out;
  },
  runway(P, m) {
    const head = P.move ? capM(P.move) : 'Static camera';
    const est = [P.shot, P.angle].filter(Boolean).join(', ');
    let scene = (est ? est + ' of ' : '') + (P.subject || 'the scene');
    if (P.setting) scene += ' ' + P.setting; if (P.time) scene += ' ' + P.time; if (P.weather) scene += ', ' + P.weather;
    const det = [];
    if (P.actAll) det.push(sentence('The subject is ' + P.actAll));
    if (P.detail) det.push(sentence(P.detail));
    const li = [P.lightT, P.palette ? P.palette + ' color grading' : ''].filter(Boolean).join(', '); if (li) det.push(sentence(li));
    if (P.style || P.film) det.push(sentence([P.style ? P.style + ' style' : '', P.film].filter(Boolean).join(', ')));
    if (P.mood) det.push(sentence(P.mood + ' mood'));
    const lens = [P.lens, P.dof, P.fps].filter(Boolean).join(', '); if (lens) det.push(sentence(lens));
    if (P.shots.length) det.push(shotsText(P));
    if (P.consist) det.push(sentence(P.consist));
    return head + ': ' + sentence(scene) + (det.length ? ' ' + det.join(' ') : '');
  },
  pika(P, m) {
    const a = [[P.subjectT || P.subject, P.action].filter(Boolean).join(' '), P.settingT, P.timeT, P.weatherT, P.style ? P.style + ' style' : '', P.shot, P.move, P.lightT, P.mood].filter(Boolean);
    return capM(a.join(', '));
  },
  luma(P, m) {
    const a = [sceneSentence(P, false), P.detail ? sentence(P.detail) : ''];
    const look = [P.style ? P.style + ' style' : '', P.film, P.lightT, P.palette ? P.palette + ' tones' : '', P.mood ? P.mood + ' mood' : ''].filter(Boolean).join(', ');
    if (look) a.push(sentence(look));
    const cam = [P.shot, P.angle, P.move].filter(Boolean).join(', ');
    if (cam) a.push(sentence('Camera: ' + cam));
    const lens = [P.lens, P.dof, P.fps].filter(Boolean).join(', '); if (lens) a.push(sentence(lens));
    if (P.shots.length) a.push(shotsText(P));
    if (P.consist) a.push(sentence(P.consist));
    return a.filter(Boolean).join(' ');
  },
  hailuo(P, m) {
    const hl = strip(P.moveHL) ? P.moveHL + ' ' : '';
    const cam = [P.shot, P.angle].filter(Boolean).join(', ');
    let s = (cam ? cam + ' of ' : '') + (P.subject || 'the scene');
    if (P.actAll) s += ', ' + P.actAll; if (P.setting) s += ' ' + P.setting; if (P.time) s += ' ' + P.time; if (P.weather) s += ', ' + P.weather;
    const a = [openerSentence(P), sentence(s), P.detail ? sentence(P.detail) : '', styleSentence(P), lightSentence(P), lensSentence(P), P.mood ? sentence('The mood is ' + P.mood) : ''];
    if (P.shots.length) a.push(M('shots', P.shots.map(x => `Shot ${x.i}: ${x.hl ? x.hl + ' ' : ''}${x.desc}`).join(' ')));
    if (P.consist) a.push(sentence(P.consist));
    let out = hl + a.filter(Boolean).join(' ');
    if (m.neg === 'inline' && P.neg.length) out += ' Avoid: ' + M('negative', P.neg.join(', ')) + '.';
    return out;
  },
  tags(P, m) {
    const w = (g, t) => t ? M(g, `(${strip(t)}:1.2)`) : '';
    const a = [M('quality', 'masterpiece, best quality'), P.quality, P.subjectT, P.expr, P.action, P.inter, P.settingT, P.timeT, P.weatherT, P.detail,
      P.shot, P.angle, P.move, P.lensT, P.dof, P.film, P.lightT, P.palette ? M('palette', strip(P.palette) + ' palette') : '', P.mood,
      w('style', P.style ? strip(P.style) + ' style' : ''), P.fps];
    return a.filter(Boolean).join(', ');
  },
};
function compile(model, st) {
  const saved = state; if (st) state = st;
  try {
    const m = MOD[model || state.model];
    const P = buildParts(m);
    const marked = FORMATTERS[m.fmt](P, m).replace(/ {2,}/g, ' ').trim();
    return {marked, prompt: strip(marked), negative: m.neg === 'field' ? P.neg.join(', ') : '', negAll: P.neg, P, m};
  } finally { state = saved; }
}
/* ============================================================
   8) CONFLICT RULES + COMPLETENESS SCORE
   ============================================================ */
const NIGHT = ['night','midnight','blue'];
const allIds = g => GROUPS[g].opts.map(o => o.id);
const dur = () => { const d = sel('duration')[0]; return d ? d.val : 0; };
const shotSum = () => state.shots.reduce((a, s) => a + (+s.d || 0), 0);
const RULES = [
 {lv:'error', when:()=>has('time',NIGHT)&&has('lighting',['harsh_sun']), msg:'ตั้งเวลาเป็น "กลางคืน/Blue hour" แต่เลือกแสง "แดดแรงเที่ยงวัน" — ขัดกัน', inv:[['time',NIGHT],['lighting',['harsh_sun']]], fix:{label:'เปลี่ยนเป็นแสงจันทร์', rm:['lighting','harsh_sun'], add:['lighting','moon']}},
 {lv:'error', when:()=>has('time',['noon','afternoon'])&&has('lighting',['moon']), msg:'กลางวันกับแสงจันทร์ขัดกัน', inv:[['time',['noon','afternoon']],['lighting',['moon']]], fix:{label:'ใช้แสงธรรมชาติ', rm:['lighting','moon'], add:['lighting','natural']}},
 {lv:'error', when:()=>has('weather',['clear'])&&has('weather',['rain','storm','drizzle','snowfall']), msg:'"ฟ้าใส" กับฝน/พายุ/หิมะ ขัดกัน', inv:[['weather',['clear','rain','storm','drizzle','snowfall']]], fix:{label:'เอาฟ้าใสออก', rm:['weather','clear']}},
 {lv:'error', when:()=>sel('style').some(o=>o.toon)&&has('quality',['photoreal']), msg:'สไตล์การ์ตูน/แอนิเมชัน แต่ใส่ quality "Photorealistic"', inv:[['quality',['photoreal']]], fix:{label:'เอา Photorealistic ออก', rm:['quality','photoreal']}},
 {lv:'error', when:()=>sel('style').some(o=>o.real)&&has('negative',['too_real']), msg:'เลือกสไตล์สมจริง แต่ใส่ negative "สมจริงเกินไป"', inv:[['negative',['too_real']]], fix:{label:'เอา negative ออก', rm:['negative','too_real']}},
 {lv:'error', when:()=>sel('style').some(o=>o.toon)&&has('negative',['cartoon']), msg:'เลือกสไตล์การ์ตูน แต่ใส่ negative "ดูเป็นการ์ตูน"', inv:[['negative',['cartoon']]], fix:{label:'เอา negative ออก', rm:['negative','cartoon']}},
 {lv:'error', when:()=>has('transition',['oner'])&&has('transition',['hard_cut','jump','match']), msg:'"ช็อตเดียวต่อเนื่อง" ไม่ควรมี cut', inv:[['transition',['oner','hard_cut','jump','match']]], fix:{label:'เอา One-take ออก', rm:['transition','oner']}},
 {lv:'error', when:()=>has('location',['space'])&&any('weather'), msg:'อวกาศไม่มีสภาพอากาศแบบฝน/ลม/หมอก', inv:[['location',['space']],['weather',allIds('weather')]], fix:{label:'ล้างสภาพอากาศ', clear:'weather'}},
 {lv:'warn', when:()=>has('palette',['bw'])&&(has('lighting',['neon'])||has('style',['vaporwave','cyberpunk'])), msg:'ภาพขาวดำจะทำให้สีนีออน/vaporwave หายไป', inv:[['palette',['bw']],['lighting',['neon']],['style',['vaporwave','cyberpunk']]]},
 {lv:'warn', when:()=>has('shot',['ecu','cu','insert'])&&(has('angle',['aerial'])||has('movement',['drone_fly','fpv'])), msg:'ภาพระยะใกล้มากกับมุม/การเคลื่อนแบบโดรน มักได้ผลไม่สมจริง', inv:[['shot',['ecu','cu','insert']],['angle',['aerial']],['movement',['drone_fly','fpv']]]},
 {lv:'warn', when:()=>has('lens',['macro'])&&has('shot',['ews','wide']), msg:'เลนส์มาโครไม่เหมาะกับภาพกว้าง', inv:[['lens',['macro']],['shot',['ews','wide']]], fix:{label:'ใช้ 24mm แทน', rm:['lens','macro'], add:['lens','l24']}},
 {lv:'warn', when:()=>has('lens',['macro'])&&has('dof',['deep']), msg:'เลนส์มาโครมีระยะชัดตื้นโดยธรรมชาติ — "ชัดลึก" ทำได้ยาก', inv:[['lens',['macro']],['dof',['deep']]], fix:{label:'เปลี่ยนเป็นชัดตื้น', rm:['dof','deep'], add:['dof','shallow']}},
 {lv:'warn', when:()=>has('platform',['tiktok','portrait45'])&&has('lens',['anamorphic']), msg:'เฟรมแนวตั้งกับเลนส์ anamorphic (widescreen) ไม่ค่อยเข้ากัน', inv:[['platform',['tiktok','portrait45']],['lens',['anamorphic']]]},
 {lv:'warn', when:()=>has('count',['none'])&&(any('expression')||any('action')||any('interaction')||state.dialogue.some(d=>d.line)), msg:'เลือก "ไม่มีคน" แต่มีสีหน้า/การกระทำ/บทพูด', inv:[['count',['none']]]},
 {lv:'warn', when:()=>has('count',['one','product','animal','none'])&&any('interaction'), msg:'ปฏิสัมพันธ์ต้องมีตัวละครอย่างน้อย 2', inv:[['interaction',allIds('interaction')]], fix:{label:'ตั้งเป็น 2 คน', set:['count','two']}},
 {lv:'warn', when:()=>has('shot',['two_shot'])&&has('count',['one','none','product']), msg:'"สองคนในเฟรม" แต่จำนวน subject ไม่ใช่ 2', inv:[['shot',['two_shot']]]},
 {lv:'warn', when:()=>has('era',['medieval','victorian','ayutthaya'])&&(has('location',['cyber_city'])||has('style',['cyberpunk'])), msg:'ยุคโบราณผสมไซเบอร์พังก์ — ตั้งใจทำ mashup หรือไม่?', inv:[['era',['medieval','victorian','ayutthaya']],['location',['cyber_city']]]},
 {lv:'warn', when:()=>has('time',['golden'])&&has('weather',['storm']), msg:'Golden hour มักไม่เกิดระหว่างพายุฝนฟ้าคะนอง', inv:[['time',['golden']],['weather',['storm']]]},
 {lv:'warn', when:()=>has('mood',['cheerful'])&&has('mood',['melancholy','horror']), msg:'อารมณ์ "สดใส" ขัดกับ "เศร้า/สยอง"', inv:[['mood',['cheerful','melancholy','horror']]]},
 {lv:'warn', when:()=>state.shots.length&&dur()&&state.shots.length>Math.max(1,Math.floor(dur()/2)), msg:()=>`Storyboard ${state.shots.length} ช็อตในคลิป ${dur()} วินาที — เฉลี่ยน้อยกว่า 2 วินาที/ช็อต อาจไม่ทัน`},
 {lv:'warn', when:()=>dur()&&shotSum()>dur(), msg:()=>`ผลรวมเวลาใน storyboard (${shotSum()}s) เกินความยาวคลิป (${dur()}s)`},
 {lv:'warn', when:()=>dur()>MOD[state.model].dur, msg:()=>`${MOD[state.model].name} รองรับประมาณ ${MOD[state.model].dur} วินาทีต่อคลิป (ค่าตั้งต้น) — ความยาว ${dur()}s อาจต้องแบ่งเป็นหลายคลิป/extend`, inv:[['duration',['d10','d15','d20']]]},
 {lv:'info', when:()=>has('location',GROUPS.location.opts.filter(o=>o.indoor&&o.id!=='window').map(o=>o.id))&&has('weather',['rain','storm','snowfall','dust','wind','fog','drizzle']), msg:'ฉากในอาคาร + สภาพอากาศ: จะเห็นผ่านหน้าต่างหรือไม่? แนะนำระบุใน "รายละเอียดฉาก"'},
 {lv:'info', when:()=>!MOD[state.model].audio&&(state.dialogue.some(d=>d.line)||state.vo.trim()||any('music')||any('sfx')||any('ambience')), msg:()=>`${MOD[state.model].name} ไม่สร้างเสียง — ส่วนเสียงถูกตัดออกจาก prompt (ใส่ตอนตัดต่อแทน หรือเปลี่ยนเป็น Veo 3 / Sora 2)`},
 {lv:'info', when:()=>MOD[state.model].audio==='partial'&&_cc.P&&_cc.P.hasAudio, msg:'Kling: การสร้างเสียงขึ้นกับเวอร์ชันโมเดล — ตรวจสอบก่อนใช้'},
 {lv:'info', when:()=>MOD[state.model].neg==='none'&&negList().length, msg:()=>`${MOD[state.model].name} ไม่มีช่อง negative และไม่ควรใส่คำปฏิเสธใน prompt — negative ถูกตัดออก`},
 {lv:'info', when:()=>isTh(state.onscreen), msg:'ข้อความบนจอเป็นภาษาไทย — โมเดลส่วนใหญ่ยังเรนเดอร์อักษรไทยเพี้ยน แนะนำใส่ใน post-production'},
 {lv:'warn', when:()=>thaiFields().length>0, msg:()=>`พบภาษาไทยใน: ${thaiFields().join(', ')} — ${hooks.canTranslate() ? 'กด 🌐 แปลด้วย AI หรือรอแปลอัตโนมัติ' : 'ตั้งค่า AI (⚙️) เพื่อแปลเป็นอังกฤษอัตโนมัติ'} · ส่วนที่ไฮไลต์สีเหลืองในพรีวิวคือส่วนที่ยังต้องแปล`, fix:{label:'🌐 แปลด้วย AI', act:'translate'}},
 {lv:'info', when:()=>state.shots.length&&MOD[state.model].fmt==='tags', msg:'รูปแบบ Tags ไม่รองรับ multi-shot — storyboard ถูกละไว้ (ทำทีละช็อตแทน)'},
];
function thaiFields() {
  const f = [];
  const L = {subject:'Subject', scene_detail:'รายละเอียดฉาก', style_ref:'Reference', vo:'Voice-over', neg_custom:'Negative', charName:'ชื่อตัวละคร'};
  for (const k in L) if (isTh(tr(state[k]))) f.push(L[k]);
  for (const g in state.custom) if (GROUPS[g] && isTh(tr(state.custom[g]))) f.push(GROUPS[g].th + ' (อื่นๆ)');
  state.shots.forEach((s, i) => { if (isTh(tr(s.desc))) f.push('Shot ' + (i + 1)); });
  state.dialogue.forEach((d, i) => { if (!d.thai && isTh(tr(d.line))) f.push('บทพูด ' + (i + 1)); });
  return f;
}
let _cc = {};
function evalConflicts() {
  _cc = compile();
  const out = [], bad = new Set();
  RULES.forEach(r => {
    let hit = false; try { hit = !!r.when(); } catch(e) { console.warn('rule error', e); }
    if (!hit) return;
    out.push({lv: r.lv, msg: typeof r.msg === 'function' ? r.msg() : r.msg, fix: r.fix});
    if (r.lv !== 'info') (r.inv || []).forEach(([g, ids]) => S(g).forEach(id => { if (ids.includes(id)) bad.add(g + '.' + id); }));
  });
  const order = {error:0, warn:1, info:2};
  out.sort((a, b) => order[a.lv] - order[b.lv]);
  return {list: out, bad};
}
const WEIGHTS = [
 {w:20,th:'Subject',ok:()=>state.subject.trim()||any('count')||any('gender'),go:'subject'},
 {w:12,th:'การกระทำ',ok:()=>any('action')||any('expression')||state.shots.some(s=>s.desc)||(has('count',['product'])&&state.scene_detail.trim()),go:'action',skip:()=>has('count',['none'])},
 {w:10,th:'สถานที่',ok:()=>any('location'),go:'location'},
 {w:8,th:'ขนาดภาพ',ok:()=>any('shot'),go:'shot'},
 {w:8,th:'การเคลื่อนกล้อง',ok:()=>any('movement'),go:'movement'},
 {w:8,th:'แสง',ok:()=>any('lighting'),go:'lighting'},
 {w:8,th:'สไตล์',ok:()=>any('style'),go:'style'},
 {w:6,th:'อารมณ์',ok:()=>any('mood'),go:'mood'},
 {w:5,th:'มุมกล้อง',ok:()=>any('angle'),go:'angle'},
 {w:5,th:'โทนสี',ok:()=>any('palette'),go:'palette'},
 {w:4,th:'ช่วงเวลา',ok:()=>any('time'),go:'time',skip:()=>has('location',['studio','space','underwater'])},
 {w:3,th:'แพลตฟอร์ม',ok:()=>any('platform'),go:'platform'},
 {w:3,th:'เสียง',ok:()=>any('music')||any('sfx')||any('ambience')||state.dialogue.some(d=>d.line),go:'music',skip:()=>!MOD[state.model].audio},
];
function score(conf) {
  let tot = 0, got = 0; const miss = [];
  WEIGHTS.forEach(x => { if (x.skip && x.skip()) return; tot += x.w; if (x.ok()) got += x.w; else miss.push(x); });
  let s = tot ? Math.round(got / tot * 100) : 0;
  s -= 10 * conf.list.filter(c => c.lv === 'error').length;
  return {s: Math.max(0, s), miss};
}

function paramsObj() {
  const p = sel('platform')[0], f = sel('fps')[0];
  return {aspect_ratio: p ? p.ar : '16:9 (default)', duration_s: dur() || null, fps: f && f.fpsv ? f.fpsv : null, seed: state.seed ? (+state.seed || state.seed) : null, character_reference: state.charRef};
}
function specJSON() {
  return {idea: state.idea, subject: {text: state.subject, character: state.charName || undefined}, selections: state.sel, custom: state.custom, locks: state.locks,
    scene_detail: state.scene_detail, style_ref: state.style_ref, storyboard: state.shots,
    audio: {dialogue: state.dialogue, voice_over: state.vo, voice: S('voice'), music: S('music'), sfx: S('sfx'), ambience: S('ambience')},
    onscreen_text: state.onscreen, negative: {options: S('negative'), custom: state.neg_custom, auto: state.autoNeg},
    params: paramsObj(), target_model: state.model};
}
function thaiSummary() {
  const lines = [];
  STEPS.forEach(s => s.items.forEach(it => {
    if (typeof it !== 'string') return;
    const v = sel(it).map(o => o.th); if ((state.custom[it] || '').trim()) v.push(state.custom[it].trim());
    if (v.length) lines.push(`• ${GROUPS[it].th}: ${v.join(', ')}`);
  }));
  return `🎬 สรุปคลิป (${MOD[state.model].name})\nSubject: ${state.subject || '-'}\n` + lines.join('\n');
}
function taxonomyForLLM() {
  return Object.values(GROUPS).map(g => `${g.id} [${g.max ? 'multi, max ' + g.max : 'single'}]: ` + g.opts.map(o => o.id + '=' + (o.en || (o.val ? o.val + ' seconds' : o.th))).join('; ')).join('\n');
}
function applyParsed(j) {
  const sel = {}, ai = {}, ignored = [], custom = {};
  const src = (j && typeof j.selections === 'object' && j.selections) || {};
  for (const g in src) {
    const G_ = GROUPS[g]; if (!G_) { ignored.push(g); continue; }
    let ids = (Array.isArray(src[g]) ? src[g] : [src[g]]).map(x => String(x).trim()).filter(id => { const ok = !!OPT[g + '.' + id]; if (!ok) ignored.push(g + '.' + id); return ok; });
    ids = [...new Set(ids)];
    if (ids.length > (G_.max || 1)) { ignored.push(...ids.slice(G_.max || 1).map(id => g + '.' + id + ' (เกินจำนวน)')); ids = ids.slice(0, G_.max || 1); }
    if (ids.length) { sel[g] = ids; ids.forEach(id => ai[g + '.' + id] = 1); }
  }
  const cs = (j && typeof j.custom === 'object' && j.custom) || {};
  for (const g in cs) if (GROUPS[g] && typeof cs[g] === 'string' && cs[g].trim()) custom[g] = cs[g].trim().slice(0, 200);
  return {sel, ai, custom, ignored};
}

/* ---- translation cache (filled by the app/API) + hooks ---- */
const trCache = {};
function tr(s) { if (!s) return s; const k = String(s).trim(); return (isTh(k) && trCache[k]) ? trCache[k] : s; }
const hooks = { canTranslate: () => false };
function setState(s) { state = s; }
function getState() { return state; }
function withState(st, fn) { const prev = state; state = st; try { return fn(); } finally { state = prev; } }
/** Normalise any partial/untrusted spec into a full state object (unknown keys dropped). */
function normalizeSpec(input) {
  const b = blank(); const s = input && typeof input === 'object' ? input : {};
  for (const k of Object.keys(b)) if (s[k] !== undefined) b[k] = s[k];
  if (!MOD[b.model]) b.model = 'veo';
  const sel = {}; for (const g in (b.sel || {})) if (GROUPS[g] && Array.isArray(b.sel[g])) sel[g] = b.sel[g].filter(id => OPT[g + '.' + id]).slice(0, GROUPS[g].max || 1);
  b.sel = sel;
  const custom = {}; for (const g in (b.custom || {})) if (GROUPS[g] && typeof b.custom[g] === 'string') custom[g] = b.custom[g].slice(0, 500);
  b.custom = custom;
  b.shots = Array.isArray(b.shots) ? b.shots.slice(0, 12) : []; b.dialogue = Array.isArray(b.dialogue) ? b.dialogue.slice(0, 12) : [];
  b.locks = Array.isArray(b.locks) ? b.locks.filter(g => GROUPS[g]) : [];
  b.ai = b.ai && typeof b.ai === 'object' ? b.ai : {};
  for (const k of ['idea','subject','scene_detail','style_ref','vo','onscreen','neg_custom','seed','charName']) b[k] = String(b[k] ?? '').slice(0, 2000);
  return b;
}
/** Compile + validate a spec in one call (used by the API). */
function analyze(spec, model) {
  const st = normalizeSpec(spec);
  return withState(st, () => { const r = compile(model || st.model); const conf = evalConflicts(); const sc = score(conf);
    return { prompt: r.prompt, negative: r.negative, negAll: r.negAll, model: r.m.id || (model || st.model), format: r.m.fmt, maxChars: r.m.max,
      conflicts: conf.list.map(c => ({ level: c.lv, message: c.msg })), score: sc.s, missing: sc.miss.map(x => x.th), params: paramsObj(), spec: specJSON() }; });
}

export {
  GROUPS, G, STEPS, G2S, OPT, MODELS, MOD, PRESETS, blank, state, clone, esc, TH_RE, isTh, M, strip, capM, art, stripPrep, joinList, S, sel, has, any, ph, pm, buildParts, autoNeg, negList, audioLines, sentence, sceneSentence, openerSentence, styleSentence, lightSentence, lensSentence, shotsText, FORMATTERS, compile, NIGHT, allIds, dur, shotSum, RULES, thaiFields, _cc, evalConflicts, WEIGHTS, score, paramsObj, specJSON, thaiSummary, taxonomyForLLM, applyParsed, trCache, tr, hooks, setState, getState, withState, normalizeSpec, analyze
};
