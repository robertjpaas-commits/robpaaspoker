(function () {
  // Home mockup: twelve tiled tables.
  var screen = document.getElementById("screen");
  if (screen) {
  for (var i = 0; i < 12; i++) {
    var t = document.createElement("div");
    t.className = "tbl";
    var you = document.createElement("div");
    you.className = "you";
    t.appendChild(you);
    screen.appendChild(t);
  }
  }

  // Screen sizes: most tables that fit at a playable size.
  var sizes = [
    ["1080p", "1920 × 1080", 6, 3, 2],
    ["1440p", "2560 × 1440", 12, 4, 3],
    ["4K", "3840 × 2160", 16, 4, 4],
    ["Ultrawide", "3440 × 1440", 15, 5, 3, true]
  ];
  var box = document.getElementById("sizes");
  if (box) sizes.forEach(function (s) {
    var row = document.createElement("div");
    row.className = "size";
    var name = document.createElement("div");
    name.className = "size-name";
    name.innerHTML = s[0] + "<small>" + s[1] + "</small>";
    var g = document.createElement("div");
    g.className = "size-grid" + (s[5] ? " wide" : "");
    g.style.gridTemplateColumns = "repeat(" + s[3] + ", 1fr)";
    g.style.gridTemplateRows = "repeat(" + s[4] + ", 1fr)";
    for (var k = 0; k < s[2]; k++) g.appendChild(document.createElement("i"));
    var n = document.createElement("div");
    n.className = "size-n";
    n.textContent = s[2];
    row.append(name, g, n);
    box.appendChild(row);
  });

  // HUD table seats: [left%, top%, label, row1, row2, thin, hovered, hero]
  var seats = [
    [50, 88, "You", "", "", false, false, true],
    [16, 74, "Seat 1", "24/19/8", "655/2.4"],
    [8, 44, "Seat 2", "52/8/3", "212/0.6"],
    [24, 13, "Seat 3", "31/22/9", "412/2.3", false, true],
    [50, 10, "Seat 4", "22/18/6", "184/1.8"],
    [76, 13, "Seat 5", "38/30/12", "1.2k/3.0"],
    [92, 44, "Seat 6", "17/14/5", "340/1.9"],
    [84, 74, "Seat 7", "29/23/11", "271/2.6"]
  ];
  var holder = document.getElementById("seats");
  if (holder) seats.forEach(function (s) {
    var d = document.createElement("div");
    d.className = "seat" + (s[7] ? " hero-seat" : "");
    d.style.left = s[0] + "%";
    d.style.top = s[1] + "%";
    var av = document.createElement("div");
    av.className = "av";
    av.textContent = s[2];
    if (s[1] < 50 && s[3]) {
      d.appendChild(hudBox(s));
      d.appendChild(av);
    } else {
      d.appendChild(av);
      if (s[3]) d.appendChild(hudBox(s));
    }
    holder.appendChild(d);
  });
  function hudBox(s) {
    var b = document.createElement("div");
    b.className = "hbox" + (s[5] ? " thin" : "") + (s[6] ? " hov" : "");
    b.innerHTML = s[3] + "<br>" + s[4];
    return b;
  }

  // Position report: value and target band per seat; colour by distance from the band.
  var rows = [
    ["RFI", [[14, 15, 19], [19, 18, 22], [22, 23, 27], [26, 29, 34], [34, 47, 50], [10, 36, 44], null]],
    ["VPIP", [[16, 15, 20], [21, 19, 24], [25, 24, 29], [31, 30, 36], [44, 48, 54], [41, 42, 50], [42, 55, 62]]],
    ["3-bet", [[4.1, 4, 6], [5.3, 5, 7], [6.2, 6, 8], [7.9, 8, 10], [9.8, 9, 12], [10.4, 11, 14], [9.1, 10, 13]]]
  ];
  var body = document.getElementById("pos-body");
  if (body) rows.forEach(function (r) {
    var tr = document.createElement("tr");
    var th = document.createElement("th");
    th.textContent = r[0];
    tr.appendChild(th);
    r[1].forEach(function (c) {
      var td = document.createElement("td");
      var sp = document.createElement("span");
      if (!c) {
        sp.className = "n";
        sp.textContent = "–";
      } else {
        var v = c[0], lo = c[1], hi = c[2];
        var off = v < lo ? lo - v : v > hi ? v - hi : 0;
        sp.className = off > 25 ? "r" : off > 10 ? "y" : "g";
        sp.textContent = v;
        sp.title = r[0] + " " + v + "% · target " + lo + "–" + hi + "%";
      }
      td.appendChild(sp);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });

  // Bankroll calendar: September 2026 starts on a Tuesday. Played Thursday to Monday.
  var cal = document.getElementById("cal");
  if (cal) {
    var results = {3: 420, 4: -180, 5: 610, 6: -95, 7: 240, 10: -310, 11: 185, 12: 1210, 13: -420, 14: 90,
      17: 305, 18: -140, 19: -265, 20: 880, 21: 45, 24: -230, 25: 160, 26: 390, 27: -515, 28: 0};
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(function (d) {
      var h = document.createElement("div");
      h.className = "cal-dow";
      h.textContent = d;
      cal.appendChild(h);
    });
    cal.appendChild(document.createElement("div"));
    for (var day = 1; day <= 30; day++) {
      var c = document.createElement("div");
      var v = results[day];
      c.className = "cal-day" + (v === undefined ? "" : v > 0 ? " win" : v < 0 ? " loss" : " even");
      var n = document.createElement("small");
      n.textContent = day;
      c.appendChild(n);
      if (v !== undefined) {
        var amt = document.createElement("b");
        var a = Math.abs(v);
        amt.textContent = (v > 0 ? "+" : v < 0 ? "\u2212" : "") + (a >= 1000 ? (a / 1000).toFixed(1) + "k" : a);
        c.appendChild(amt);
      }
      cal.appendChild(c);
    }
  }

  // Copy the feedback address.
  var btn = document.getElementById("copy-email");
  var email = document.getElementById("email");
  if (btn && email) btn.addEventListener("click", function () {
    var text = email.textContent;
    function selectIt() {
      var range = document.createRange();
      range.selectNodeContents(email);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = "Press Ctrl+C";
    }
    try {
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1600);
      }, selectIt);
    } catch (e) { selectIt(); }
  });

  // Download: swap an invite code for a link. The site is static, so the check
  // and the installer live in the app-download Worker (C:\\StreamScripts\\app-download).
  var API = "https://get.robpaaspoker.com";
  var form = document.getElementById("code-form");
  if (form) {
    var input = document.getElementById("code");
    var go = document.getElementById("code-go");
    var msg = document.getElementById("code-msg");
    var unlocked = document.getElementById("unlocked");
    var said = {
      invalid: "That code isn't right. Check it and try again.",
      used: "That code has already been used.",
      no_file: "The installer isn't available right now. Try again a little later."
    };
    // Dashes go in as you type: ABCD-EFGH-JKLM.
    input.addEventListener("input", function () {
      var raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
      input.value = raw.replace(/(.{4})(?=.)/g, "$1-");
      input.classList.remove("bad");
      msg.textContent = "";
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var code = input.value.replace(/[^A-Za-z0-9]/g, "");
      if (code.length < 8) {
        input.classList.add("bad");
        msg.textContent = "Enter the code you were given.";
        return;
      }
      go.disabled = true;
      go.textContent = "Checking";
      fetch(API + "/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code })
      }).then(function (r) {
        return r.json().then(function (data) { return { ok: r.ok, data: data }; });
      }).then(function (res) {
        if (!res.ok) {
          input.classList.add("bad");
          msg.textContent = said[res.data.error] || "Something went wrong. Try again.";
          return;
        }
        form.hidden = true;
        var link = document.getElementById("dl-link");
        link.href = res.data.url;
        var mb = res.data.size ? " (" + Math.round(res.data.size / 1e6) + " MB)" : "";
        document.getElementById("dl-label").textContent = "Download " + (res.data.version ? "version " + res.data.version : "for Windows") + mb;
        document.getElementById("dl-note").textContent =
          "Your download should start by itself. This link works for " + res.data.hours + " hours.";
        unlocked.hidden = false;
        window.location.href = res.data.url;
      }).catch(function () {
        msg.textContent = "Couldn't reach the download server. Check your connection and try again.";
      }).then(function () {
        go.disabled = false;
        go.textContent = "Unlock";
      });
    });
  }
})();
