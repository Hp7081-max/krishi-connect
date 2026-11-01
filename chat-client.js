/* Krishi Connect — private chat (farmer <-> buyer).
   Loaded automatically by server.js after the main app script.
   Needs: /api/chat (routes/chat.js) and the login token the app already stores (krishi_token).
   If anything the app provides is missing, the chat simply does not appear and nothing else changes.

   v2: chat-extras.js ke liye hooks jode gaye:
     - #chat-messages, #chat-input-bar, #chat-input  (chat-extras.js inhe naam se dhundti hai)
     - window.currentConversationId / window.currentChatPartnerId
     - kc-list / kc-row / kc-note ke naam kcc-* kar diye (chat-extras.css se takra rahe the) */
(function(){
  "use strict";
  if(window.KrishiChat) return;

  var BASE = (location.protocol.indexOf("http")===0) ? location.origin : "http://localhost:5000";
  var panelOpen=false, view="inbox", cur=null, sock=null, sockToken=null, unread=0, convs=[];

  function L(hi,en){ try{ return (typeof S!=="undefined" && S && S.lang==="en") ? en : hi; }catch(e){ return hi; } }
  function token(){ try{ return localStorage.getItem("krishi_token")||""; }catch(e){ return ""; } }
  function say(m){ if(typeof toast==="function") toast(m); else alert(m); }
  function role(){ try{ return typeof getAuthRole==="function" ? getAuthRole() : ""; }catch(e){ return ""; } }
  function el(tag, cls, text){ var n=document.createElement(tag); if(cls) n.className=cls; if(text!=null) n.textContent=text; return n; }

  /* chat-extras.js ko batao ki abhi kaun si chat khuli hai */
  function setCurrent(id, partnerId){
    window.currentConversationId = id ? String(id) : null;
    window.currentChatPartnerId = partnerId ? String(partnerId) : null;
  }

  function api(path, opts){
    opts = opts || {};
    var h = {"Authorization":"Bearer "+token()};
    if(opts.body) h["Content-Type"]="application/json";
    return fetch(BASE+"/api/chat"+path, {method:opts.method||"GET", headers:h, body:opts.body?JSON.stringify(opts.body):undefined})
      .then(function(r){ return r.json().catch(function(){ return {success:false,message:"Server se jawab nahi mila."}; }); })
      .then(function(j){ if(!j.success) throw new Error(j.message||"Chat me dikkat aayi."); return j; });
  }

  function fmt(at){
    if(!at) return "";
    var d=new Date(at), n=new Date(), p=function(x){ return (x<10?"0":"")+x; };
    return d.toDateString()===n.toDateString() ? p(d.getHours())+":"+p(d.getMinutes()) : p(d.getDate())+"/"+p(d.getMonth()+1);
  }

  /* ---------- styles ---------- */
  var css = document.createElement("style");
  css.textContent =
  "#kcFab{position:fixed;left:14px;bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:9998;width:54px;height:54px;border-radius:50%;border:0;background:var(--leaf,#2E6B4F);color:#fff;font-size:24px;box-shadow:0 6px 18px rgba(0,0,0,.28);cursor:pointer;display:none}"+
  "#kcFab b{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:var(--chilli,#BE3B2B);color:#fff;font-size:12px;line-height:20px;padding:0 5px;display:none}"+
  "#kcPanel{position:fixed;inset:0;z-index:9999;background:var(--paper,#EFF2EA);color:var(--ink,#16261D);display:none;flex-direction:column;font-family:inherit;padding-top:env(safe-area-inset-top,0px)}"+
  "#kcPanel.on{display:flex}"+
  /* chat-extras.js ke popup (offer form waghera) is panel ke upar dikhne chahiye */
  ".kc-ov{z-index:10001!important}.kc-toast{z-index:10002!important}"+
  ".kc-top{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--card,#fff);border-bottom:1px solid var(--line,#D9DFD5)}"+
  ".kc-top h3{margin:0;font-size:17px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
  ".kc-top small{display:block;font-weight:400;font-size:12px;opacity:.7}"+
  ".kc-ib{border:0;background:transparent;color:inherit;font-size:20px;padding:4px 8px;cursor:pointer}"+
  ".kcc-list{flex:1;overflow-y:auto;padding:10px 12px}"+
  ".kcc-row{display:flex;gap:10px;align-items:center;padding:12px;margin-bottom:8px;border-radius:14px;background:var(--card,#fff);border:1px solid var(--line,#D9DFD5);cursor:pointer}"+
  ".kc-av{width:42px;height:42px;border-radius:50%;background:var(--leaf-soft,#DCEBE0);display:flex;align-items:center;justify-content:center;font-size:22px;flex:none}"+
  ".kc-mid{flex:1;min-width:0}.kc-mid b{display:block}.kc-mid span{display:block;font-size:13px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
  ".kc-meta{text-align:right;font-size:12px;opacity:.8}.kc-meta i{display:inline-block;margin-top:4px;min-width:20px;height:20px;border-radius:10px;background:var(--leaf,#2E6B4F);color:#fff;font-style:normal;line-height:20px;padding:0 6px}"+
  ".kc-empty{text-align:center;opacity:.7;padding:40px 20px}"+
  ".kc-msg{max-width:80%;margin:6px 0;padding:8px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;background:var(--card,#fff);border:1px solid var(--line,#D9DFD5)}"+
  ".kc-msg.me{margin-left:auto;background:var(--leaf-soft,#DCEBE0)}"+
  ".kc-msg time{display:block;font-size:11px;opacity:.6;margin-top:2px;text-align:right}"+
  ".kcc-note{font-size:12px;text-align:center;opacity:.65;margin:8px 0}"+
  ".kc-chips{display:flex;gap:6px;overflow-x:auto;padding:6px 12px 0}.kc-chips button{flex:none;border:1px solid var(--line,#D9DFD5);background:var(--card,#fff);color:inherit;border-radius:16px;padding:6px 12px;font-size:13px;cursor:pointer}"+
  ".kc-in{display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));background:var(--card,#fff);border-top:1px solid var(--line,#D9DFD5)}"+
  ".kc-in textarea{flex:1;resize:none;height:42px;max-height:110px;border:1px solid var(--line,#D9DFD5);border-radius:12px;padding:10px;font:inherit;background:var(--paper,#EFF2EA);color:inherit}"+
  ".kc-in button{border:0;border-radius:12px;background:var(--leaf,#2E6B4F);color:#fff;padding:0 16px;font-size:16px;cursor:pointer}.kc-in button[disabled]{opacity:.5}";
  document.head.appendChild(css);

  /* ---------- DOM shell ---------- */
  var fab=el("button"); fab.id="kcFab"; fab.type="button"; fab.setAttribute("aria-label","Chat"); fab.textContent="💬";
  var badge=el("b"); fab.appendChild(badge);
  var panel=el("div"); panel.id="kcPanel";
  document.body.appendChild(fab); document.body.appendChild(panel);
  fab.addEventListener("click", function(){ openPanel("inbox"); });

  function setBadge(n){ unread=n||0; badge.textContent=unread>99?"99+":unread; badge.style.display=unread?"block":"none"; }
  function refreshUnread(){ if(!token()) return; api("/unread").then(function(j){ setBadge(j.count); }).catch(function(){}); }

  /* ---------- inbox ---------- */
  function openPanel(v){ panelOpen=true; panel.classList.add("on"); if(v==="inbox") showInbox(); }
  function closePanel(){ panelOpen=false; cur=null; setCurrent(null,null); panel.classList.remove("on"); refreshUnread(); }

  function top(title, sub, backFn, extra){
    var t=el("div","kc-top");
    var b=el("button","kc-ib", backFn?"←":"✕"); b.type="button"; b.onclick=backFn||closePanel; t.appendChild(b);
    var h=el("h3",null,title); if(sub){ h.appendChild(el("small",null,sub)); } t.appendChild(h);
    if(extra) t.appendChild(extra);
    return t;
  }

  function showInbox(){
    view="inbox"; cur=null; setCurrent(null,null); panel.textContent="";
    panel.appendChild(top(L("मेरी चैट","My chats")));
    var list=el("div","kcc-list"); panel.appendChild(list);
    list.appendChild(el("div","kc-empty",L("लोड हो रहा है…","Loading…")));
    api("/conversations").then(function(j){
      convs=j.data||[]; list.textContent="";
      if(!convs.length){
        list.appendChild(el("div","kc-empty",L("अभी कोई चैट नहीं। बाज़ार में किसी फसल पर 💬 दबाकर शुरू करें।","No chats yet. Tap 💬 on a crop in the market to start one.")));
        return;
      }
      convs.forEach(function(c){
        var row=el("div","kcc-row"), av=el("div","kc-av", c.other.role==="buyer"?"🏬":"🧑‍🌾");
        var mid=el("div","kc-mid"); mid.appendChild(el("b",null,c.other.name||"—"));
        var em=(typeof cropEm==="function"&&c.cropKey)?cropEm(c.cropKey)+" ":"";
        mid.appendChild(el("span",null,em+((c.lastMine?L("आप: ","You: "):"")+(c.lastText||L("बातचीत शुरू करें","Say hello")))));
        var meta=el("div","kc-meta",fmt(c.lastAt)); if(c.unread){ meta.appendChild(document.createElement("br")); meta.appendChild(el("i",null,c.unread)); }
        row.appendChild(av); row.appendChild(mid); row.appendChild(meta);
        row.onclick=function(){ openThread(c.id); };
        list.appendChild(row);
      });
    }).catch(function(e){ list.textContent=""; list.appendChild(el("div","kc-empty",e.message)); });
  }

  /* ---------- one conversation ---------- */
  var listEl=null, noteEl=null;
  function msgNode(m){
    var d=el("div","kc-msg"+(m.mine?" me":""), m.text); d.dataset.id=m.id; d.appendChild(el("time",null,fmt(m.at))); return d;
  }
  /* seedhe text message hamesha chat-extras.js ke cards (#kc-rich-list) se pehle rakhe jate hain */
  function put(node){
    var rich=listEl.querySelector("#kc-rich-list");
    if(rich) listEl.insertBefore(node, rich); else listEl.appendChild(node);
  }
  function addMsg(m, scroll){
    if(!cur || !listEl || cur.ids[m.id]) return;
    cur.ids[m.id]=1; put(msgNode(m));
    if(scroll!==false) listEl.scrollTop=listEl.scrollHeight;
  }

  function openThread(id){
    view="thread"; panel.textContent="";
    cur={id:id, ids:{}, conv:null, oldest:0};
    setCurrent(id, null);
    var menu=el("button","kc-ib","⋯"); menu.type="button";
    panel.appendChild(top("…", "", showInbox, menu));
    listEl=el("div","kcc-list"); listEl.id="chat-messages"; listEl.setAttribute("data-conversation-id", String(id)); panel.appendChild(listEl);
    var chips=el("div","kc-chips");
    [[L("भाव थोड़ा कम करें","Can you lower the rate?")],[L("माल कब उठाएँगे?","When will you pick up?")],[L("माल की फोटो भेजें","Please share a photo of the crop")]].forEach(function(q){
      var b=el("button",null,q[0]); b.type="button"; b.onclick=function(){ ta.value=q[0]; ta.focus(); }; chips.appendChild(b);
    });
    panel.appendChild(chips);
    var inb=el("div","kc-in"), ta=el("textarea"); inb.id="chat-input-bar"; ta.id="chat-input"; ta.maxLength=1000; ta.placeholder=L("संदेश लिखें…","Type a message…");
    var send=el("button",null,"➤"); send.type="button"; inb.appendChild(ta); inb.appendChild(send); panel.appendChild(inb);

    function doSend(){
      var text=ta.value.trim(); if(!text||send.disabled) return;
      send.disabled=true;
      api("/"+id+"/messages",{method:"POST",body:{text:text}}).then(function(j){
        ta.value=""; addMsg(j.data.message);
        if(j.data.masked) say(L("फोन नंबर / ईमेल छिपा दिया गया। बातचीत ऐप में ही करें।","Phone number / email was hidden. Please keep the chat inside the app."));
      }).catch(function(e){ say("⚠️ "+e.message); }).then(function(){ send.disabled=false; });
    }
    send.onclick=doSend;
    ta.addEventListener("keydown",function(e){ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); doSend(); } });

    api("/"+id+"/messages").then(function(j){
      cur.conv=j.data.conversation; var c=cur.conv;
      /* samne wale ki id chat-extras.js ko do (server jo naam de, wo try karte hain) */
      var o=c.other||{};
      var oid=o.id||o._id||o.userId||c.otherId||c.otherUserId||c.partnerId||"";
      if(oid) setCurrent(id, oid);
      var h=panel.querySelector(".kc-top h3"); h.textContent=c.other.name||"—";
      h.appendChild(el("small",null,(c.other.role==="buyer"?L("खरीदार","Buyer"):L("किसान","Farmer"))+((typeof cropEm==="function"&&c.cropKey)?" · "+cropEm(c.cropKey):"")));
      menu.onclick=function(){
        var next=!c.blockedByMe;
        if(!confirm(next?L("इस चैट को ब्लॉक करें?","Block this chat?"):L("ब्लॉक हटाएँ?","Unblock this chat?"))) return;
        api("/"+id+"/block",{method:"POST",body:{block:next}}).then(function(){ c.blockedByMe=next; say(next?L("ब्लॉक कर दिया","Blocked"):L("ब्लॉक हटा दिया","Unblocked")); }).catch(function(e){ say("⚠️ "+e.message); });
      };
      put(el("div","kcc-note","🔒 "+L("नंबर/ईमेल साझा न करें। सौदा ऐप में ही करें — एस्क्रो से पैसा सुरक्षित रहता है।","Don't share numbers/emails. Deal inside the app — escrow keeps your money safe.")));
      j.data.messages.forEach(function(m){ addMsg(m,false); });
      listEl.scrollTop=listEl.scrollHeight;
      refreshUnread();
    }).catch(function(e){ listEl.appendChild(el("div","kc-empty",e.message)); });
  }

  /* ---------- start a chat from a listing / bid ---------- */
  function start(body){
    if(!token()){ say(L("चैट के लिए पहले लॉगिन करें","Please log in to use chat")); return; }
    api("/start",{method:"POST",body:body}).then(function(j){ openPanel(); openThread(j.data.id); })
      .catch(function(e){ say("⚠️ "+e.message); });
  }
  document.addEventListener("click", function(e){
    var b=e.target.closest&&e.target.closest("[data-kc-chat]"); if(!b) return;
    e.preventDefault(); e.stopPropagation();
    var o={}; o[b.getAttribute("data-kc-chat")==="bid"?"bidId":"listingId"]=b.getAttribute("data-id"); start(o);
  }, true);

  /* ---------- add 💬 buttons to the app's own cards (no edit of the big HTML file) ---------- */
  if(typeof window.listingCardHTML==="function"){
    var origCard=window.listingCardHTML;
    window.listingCardHTML=function(l, forFarmer){
      var h=origCard.apply(this, arguments);
      try{
        if(!forFarmer && role()==="buyer" && l && l.id){
          var btn='<div class="bid-line"><button type="button" class="btn sm grey" data-kc-chat="listing" data-id="'+String(l.id).replace(/"/g,"")+'">💬 '+L("किसान से चैट","Chat with farmer")+'</button></div>';
          h=h.replace(/<\/article>\s*$/, btn+"</article>");
        }
      }catch(e){}
      return h;
    };
  }
  if(typeof window.bidLineHTML==="function"){
    var origBid=window.bidLineHTML;
    window.bidLineHTML=function(b){
      var h=origBid.apply(this, arguments);
      try{
        if(role()==="farmer" && b && b.id){
          h=h.replace(/<\/div>\s*$/, '<button type="button" class="btn sm grey" data-kc-chat="bid" data-id="'+String(b.id).replace(/"/g,"")+'" title="'+L("चैट","Chat")+'">💬</button></div>');
        }
      }catch(e){}
      return h;
    };
  }

  /* ---------- live messages ---------- */
  function connect(){
    var t=token();
    if(!t){ if(sock){ sock.disconnect(); sock=null; sockToken=null; } return; }
    if(sock && sockToken===t) return;
    if(typeof io==="undefined"){
      if(document.getElementById("kcIoScript")) return;
      var s=document.createElement("script"); s.id="kcIoScript"; s.src=BASE+"/socket.io/socket.io.js"; s.onload=connect; document.head.appendChild(s); return;
    }
    if(sock) sock.disconnect();
    sockToken=t; sock=io(BASE+"/chat",{auth:{token:t}});
    sock.on("chat:message", function(ev){
      var m=ev.message;
      if(panelOpen && view==="thread" && cur && cur.id===m.convId){
        addMsg(m); if(!m.mine) api("/"+m.convId+"/messages?limit=1").catch(function(){});
      } else if(panelOpen && view==="inbox"){ showInbox(); }
      if(!m.mine) refreshUnread();
    });
  }

  /* the app logs in without a page reload, so watch for the token */
  var lastTok=null;
  setInterval(function(){
    var t=token(), r=role();
    fab.style.display=(t && (r==="farmer"||r==="buyer"))?"block":"none";
    if(t!==lastTok){ lastTok=t; connect(); if(t) refreshUnread(); else setBadge(0); }
  }, 2000);
  setInterval(function(){ if(token() && !(sock&&sock.connected)) refreshUnread(); }, 30000);

  window.KrishiChat={ open:function(){ openPanel("inbox"); }, startFromListing:function(id){ start({listingId:id}); }, startFromBid:function(id){ start({bidId:id}); } };
})();
