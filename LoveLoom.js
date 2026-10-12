// LoveLoom · 0.9.6 · five private home-screen widgets for Scriptable.
// Paste into a script named LoveLoom. Widget parameter = the Russian name below.
// No AI calls, passwords or account JWTs. The personal capability stays in Keychain.
const LL_API="https://zolvjfgbkvzyrarwpeel.supabase.co/functions/v1/loveloom-widget";
const LL_APP="https://timaarzic.github.io/loveloom/";
const LL_KEY="loveloom.home.v1",LL_CACHE=LL_KEY+".snapshot",LL_QUEUE=LL_KEY+".pending";
const LL_KINDS=["days","moods","pulse","photo","meeting"];
const LL_NAMES=["Наша нить","Две нити","Я рядом","Наш кадр","До объятий"];
const LL_PULSES={miss:"Скучаю",hug:"Обнять",think:"Думаю о тебе"};
const LL_MOODS={happy:["Хорошо","#f7dfac"],calm:["Спокойно","#dce9ce"],tired:["Усталость","#ddd5ed"],sad:["Грустно","#d9e4ed"],anxious:["Тревожно","#f0d3d9"]};
function llGet(key){try{return Keychain.contains(key)?Keychain.get(key):"";}catch{return "";}}
function llSet(key,value){Keychain.set(key,value);}
function llRemove(key){if(Keychain.contains(key))Keychain.remove(key);}
function llErase(secret){if(llGet(LL_KEY)!==secret)return;[LL_KEY,LL_CACHE,LL_QUEUE].forEach(llRemove);}
function llJSON(value){try{return JSON.parse(value);}catch{return null;}}
function llCached(secret){const c=llJSON(llGet(LL_CACHE)),age=c?Date.now()-c.received:Infinity;return c&&c.scope===secret&&age>=0&&age<86400000&&c.body.expires>c.body.serverTime+age?{...c.body,serverTime:c.body.serverTime+age,snapshotAt:c.body.serverTime,cached:true}:null;}
function llRemember(secret,body){if(llGet(LL_KEY)===secret&&body.connected)llSet(LL_CACHE,JSON.stringify({scope:secret,received:Date.now(),body}));}
async function llCall(secret,action="state",requestId=null,payload={}){
 const request=new Request(LL_API);request.method="POST";request.headers={"Content-Type":"application/json"};request.body=JSON.stringify({token:secret,action,requestId,payload});request.timeoutInterval=12;request.onRedirect=()=>null;
 const body=await request.loadJSON(),status=request.response?.statusCode||200;
 if(status>=400||body.error){const error=new Error(body.error||"Не получилось обновить виджет.");error.review=status===400||status===403;throw error;}
 if(!body.connected){llErase(secret);throw new Error("Подключение отменено. Получите новый код в LoveLoom.");}
 return body;
}
function llURL(action,extra={}){const base=URLScheme.forRunningScript();return base+(base.includes("?")?"&":"?")+Object.entries({action,...extra}).map(([k,v])=>encodeURIComponent(k)+"="+encodeURIComponent(v)).join("&");}
function llFont(size,hand=false){try{return new Font(hand?"Noteworthy-Light":"AvenirNext-Medium",size);}catch{return Font.mediumSystemFont(size);}}
function llText(stack,value,size=15,color=null,hand=false){const t=stack.addText(String(value));t.font=llFont(size,hand);t.textColor=color||Color.dynamic(new Color("#494156"),new Color("#f6edf3"));t.lineLimit=2;t.minimumScaleFactor=.7;return t;}
function llStamp(body){return new Date(body.snapshotAt||body.serverTime).toLocaleString("ru-RU",{timeZone:body.zone||"UTC",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});}
async function llLogo(){const fm=FileManager.local(),path=fm.joinPath(fm.libraryDirectory(),"loveloom-public-logo.png");try{if(fm.fileExists(path))return fm.readImage(path);const request=new Request(LL_APP+"icon-192.png");request.timeoutInterval=6;request.onRedirect=()=>null;const image=await request.loadImage();fm.writeImage(path,image);return image;}catch{return null;}}
async function llRender(kind,body){
 const widget=new ListWidget();widget.backgroundColor=Color.dynamic(new Color("#fffaf2"),new Color("#302c3b"));widget.setPadding(14,14,12,14);widget.refreshAfterDate=new Date(Date.now()+1800000);widget.url=llURL("menu",{screen:kind});
 const rose=Color.dynamic(new Color("#a44f7b"),new Color("#ecadca")),muted=Color.dynamic(new Color("#80788c"),new Color("#baafc3"));
 const top=widget.addStack();top.centerAlignContent();const logo=await llLogo();if(logo){const image=top.addImage(logo);image.imageSize=new Size(24,24);image.cornerRadius=7;}else llText(top,"♡",22,rose,true);top.addSpacer(7);llText(top,LL_NAMES[LL_KINDS.indexOf(kind)]||"LoveLoom",17,rose,true);
 widget.addSpacer(10);
 if(!body?.connected){llText(widget,"Ваше тепло здесь",22,null,true);widget.addSpacer(5);llText(widget,"Откройте LoveLoom и подключите это устройство.",12,muted);return widget;}
 if(!body.scopes.includes(kind)){llText(widget,"Этот виджет ждёт разрешения",21,null,true);llText(widget,"Фото и настроения подключаются в LoveLoom отдельно.",12,muted);return widget;}
 if(kind==="days"){const days=body.startedOn?Math.max(0,Math.floor((Date.parse(body.day+"T12:00:00Z")-Date.parse(body.startedOn+"T12:00:00Z"))/86400000)):null;llText(widget,days===null?"Начало вашей нити":days+" ♡",45,rose,true);llText(widget,days===null?"Добавьте общую дату в вашей истории.":"дней вместе",13,muted);widget.url=LL_APP+"?open=home&story=1";}
 if(kind==="moods"){(body.names||[]).slice(0,2).forEach((name,i)=>{const mood=LL_MOODS[body.moods?.[i]?.mood],row=widget.addStack();row.centerAlignContent();const mark=llText(row,"●",18,mood?new Color(mood[1]):muted);row.addSpacer(7);llText(row,name+" · "+(mood?.[0]||"В своём темпе"),13);widget.addSpacer(6);});widget.url=LL_APP+"?open=daily";}
 if(kind==="pulse"){llText(widget,body.pulse?LL_PULSES[body.pulse.kind]||"Я рядом":"Пошли немного тепла",24,rose,true);widget.addSpacer(8);if(config.widgetFamily==="small"){llText(widget,"Коснись, чтобы обнять ♡",12,muted);widget.url=llURL("pulse",{kind:"hug"});}else{const row=widget.addStack();for(const kind of ["miss","hug","think"]){const button=row.addStack();button.setPadding(8,6,8,6);button.cornerRadius=12;button.backgroundColor=Color.dynamic(new Color("#f9e0e8"),new Color("#563b50"));button.url=llURL("pulse",{kind});llText(button,LL_PULSES[kind],12,rose);row.addSpacer(6);}}}
 if(kind==="photo"){if(body.photoUrl&&!body.cached){try{const request=new Request(body.photoUrl);request.timeoutInterval=8;request.onRedirect=()=>null;const image=widget.addImage(await request.loadImage());image.imageSize=new Size(config.widgetFamily==="small"?130:280,config.widgetFamily==="large"?200:80);image.cornerRadius=12;image.applyFillingContentMode();widget.addSpacer(5);llText(widget,"Наш маленький кадр ♡",14,rose,true);}catch{llText(widget,"Наш кадр ждёт связи",21,rose,true);}}else{llText(widget,body.cached?"Наш кадр ждёт связи":"Одно фото — ваше «мы»",21,rose,true);llText(widget,"Добавьте совместный кадр в вашей истории.",11,muted);}widget.url=LL_APP+"?open=home&story=1";}
 if(kind==="meeting"){if(body.meeting){const delta=Math.max(0,body.meeting.at-body.serverTime),days=Math.floor(delta/86400000),hours=Math.floor(delta/3600000)%24;llText(widget,delta===0?"Время обнимать":days+" д · "+hours+" ч",32,rose,true);llText(widget,body.meeting.title||"До наших объятий",14,null,true);llText(widget,new Date(body.meeting.at).toLocaleString("ru-RU",{timeZone:body.meeting.zone,day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}),11,muted);}else{llText(widget,"Когда обнимемся?",25,rose,true);llText(widget,"Коснись и выбери вашу встречу.",12,muted);}widget.url=llURL("meeting");}
 widget.addSpacer();llText(widget,"Обновлено "+llStamp(body),9,muted);if(body.cached)llText(widget,"Сохранённый снимок · нет связи",9,muted);
 return widget;
}
async function llNotice(message){const a=new Alert();a.title="LoveLoom";a.message=message;a.addAction("Хорошо");await a.presentAlert();}
async function llConnect(){const a=new Alert();a.title="Маленькое рядом";a.message="В LoveLoom откройте Нить дня → Маленькое рядом, получите личный код и вставьте его здесь.";a.addSecureTextField("Личный код");a.addAction("Подключить");a.addCancelAction("Позже");if(await a.presentAlert()<0)return null;const secret=a.textFieldValue(0).trim();if(!/^[0-9a-f]{64}$/.test(secret))throw new Error("Нужен личный код из LoveLoom.");const body=await llCall(secret);const old=llGet(LL_KEY);if(old&&old!==secret){try{await llCall(old,"disconnect");}catch{}}[LL_CACHE,LL_QUEUE].forEach(llRemove);llSet(LL_KEY,secret);llRemember(secret,body);return body;}
async function llFlush(secret,state){
 let pending=llJSON(llGet(LL_QUEUE));if(!pending)return state;
 if(pending.scope!==secret||pending.payload.roomId!==state.roomId||pending.payload.epoch!==state.epoch||state.serverTime-pending.created>86400000||state.serverTime<pending.created-60000){llRemove(LL_QUEUE);throw new Error("Старый черновик не отправлен: комната или срок изменились.");}
 if(pending.review&&pending.action!=="meeting"){const a=new Alert();a.title="Нажатие не отправлено";a.message="Сервер больше не разрешает это действие. Черновик можно убрать и проверить подключение в LoveLoom.";a.addAction("Убрать черновик");a.addCancelAction("Позже");if(await a.presentAlert()===0)llRemove(LL_QUEUE);return state;}
 if(pending.review){
 const a=new Alert();a.title="Встреча изменилась";a.message="На другом устройстве уже сохранена другая дата. Ваш черновик остался здесь. Общая дата: "+(state.meeting?new Date(state.meeting.at).toLocaleString("ru-RU",{timeZone:state.meeting.zone}):"не назначена");a.addAction("Сохранить мой черновик");a.addAction("Оставить общую дату");a.addCancelAction("Позже");const choice=await a.presentAlert();if(choice<0)return state;if(choice===1){llRemove(LL_QUEUE);return state;}pending={...pending,id:UUID.string(),review:false,created:state.serverTime,payload:{...pending.payload,version:state.meetingVersion}};llSet(LL_QUEUE,JSON.stringify(pending));
 }
 try{const next=await llCall(secret,pending.action,pending.id,pending.payload);if(llGet(LL_QUEUE)===JSON.stringify(pending))llRemove(LL_QUEUE);llRemember(secret,next);return next;}catch(e){if(e.review)llSet(LL_QUEUE,JSON.stringify({...pending,review:true}));throw e;}
}
async function llWrite(secret,state,action,payload){if(llGet(LL_QUEUE))throw new Error("Предыдущий черновик ещё ждёт отправки. Запустите LoveLoom в Scriptable снова.");const pending={id:UUID.string(),scope:secret,action,payload:{...payload,roomId:state.roomId,epoch:state.epoch},created:state.serverTime};llSet(LL_QUEUE,JSON.stringify(pending));return await llFlush(secret,state);}
async function llPulse(secret,state,kind){if(!LL_PULSES[kind])throw new Error("Неизвестный Пульс.");const a=new Alert();a.title=LL_PULSES[kind];a.message="Отправить вашему человеку?";a.addAction("Отправить");a.addCancelAction("Отмена");if(await a.presentAlert()<0)return state;const next=await llWrite(secret,state,"pulse",{kind});await llNotice("Пульс отправлен.");return next;}
async function llMeeting(secret,state){if(!state.scopes.includes("meeting"))throw new Error("Этот код не разрешает изменять встречу.");const picker=new DatePicker();picker.minimumDate=new Date(state.serverTime+60000);picker.maximumDate=new Date(state.serverTime+3660*86400000);picker.initialDate=new Date(state.meeting?.at>state.serverTime?state.meeting.at:state.serverTime+86400000);const selected=await picker.pickDateAndTime();if(!selected)return state;const a=new Alert();a.title="До объятий";a.message="Одна общая дата для вас двоих.";a.addTextField("Как назовём этот день?",state.meeting?.title||"");a.addAction("Сохранить");if(state.meeting)a.addDestructiveAction("Убрать дату");a.addCancelAction("Отмена");const choice=await a.presentAlert();if(choice<0)return state;const title=a.textFieldValue(0).trim();if(title.length>60)throw new Error("Название — до 60 символов.");const meeting=choice===1?null:{at:Math.floor(selected.getTime()/60000)*60000,zone:Intl.DateTimeFormat().resolvedOptions().timeZone||state.zone,title};return await llWrite(secret,state,"meeting",{version:state.meetingVersion,meeting});}
async function llMain(){
 // Lock-screen accessories deliberately contain no personal data.
 if(config.runsInAccessoryWidget){const w=new ListWidget();w.addText("♡ LoveLoom");w.url=LL_APP;Script.setWidget(w);Script.complete();return;}
 const parameter=String(args.widgetParameter||"Наша нить").trim(),kind=LL_KINDS[LL_NAMES.indexOf(parameter)]|| (LL_KINDS.includes(parameter)?parameter:"days");
 let secret=llGet(LL_KEY),state=null;
 if(config.runsInWidget){try{if(secret){state=await llCall(secret);llRemember(secret,state);}}catch{state=llCached(secret);}Script.setWidget(await llRender(kind,state));Script.complete();return;}
 if(!secret){state=await llConnect();if(!state){Script.complete();return;}secret=llGet(LL_KEY);}
 try{state=await llCall(secret);llRemember(secret,state);state=await llFlush(secret,state);}catch(e){const cached=llCached(secret);if(!cached)throw e;state=cached;await llNotice(e.message+" Неотправленное хранится на этом устройстве.");}
 const action=args.queryParameters?.action,requested=args.queryParameters?.kind;
 if(action==="pulse"){await llPulse(secret,state,requested);}
 else if(action==="meeting"){await llMeeting(secret,state);}
 else if(action==="pin"){const selected=LL_KINDS.includes(args.queryParameters?.screen)?args.queryParameters.screen:"days",name=LL_NAMES[LL_KINDS.indexOf(selected)];await llNotice("Главный экран → удерживайте свободное место → добавьте виджет Scriptable. Скрипт: LoveLoom. Параметр: "+name+". iPad и iPhone не разрешают сайту автоматически добавлять системный виджет.");const widget=await llRender(selected,state);await widget.presentMedium();}
 else{
 const menu=new Alert();menu.title="Маленькое рядом";menu.message="Добавьте виджет Scriptable на главный экран. Выберите скрипт LoveLoom, параметр — название виджета. Система обновляет их в своём темпе.";
 LL_NAMES.forEach(name=>menu.addAction(name));menu.addAction("Открыть LoveLoom");menu.addDestructiveAction("Отключить устройство");menu.addCancelAction("Готово");const choice=await menu.presentSheet();
 if(choice>=0&&choice<5){const kind=LL_KINDS[choice];if(kind==="meeting")state=await llMeeting(secret,state);const widget=await llRender(kind,state);await widget.presentMedium();}
 else if(choice===5)Safari.open(LL_APP);else if(choice===6){const old=secret;llErase(old);try{await llCall(old,"disconnect");}catch{}await llNotice("На устройстве доступ удалён. При отсутствии сети отключите его также в LoveLoom.");}
 }
 Script.complete();
}
try{await llMain();}catch(e){if(config.runsInWidget){Script.setWidget(await llRender("days",null));Script.complete();}else{await llNotice(e.message||"Не удалось открыть виджеты.");Script.complete();}}
