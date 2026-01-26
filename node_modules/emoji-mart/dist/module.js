function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}
function $c770c458706daa72$export$2e2bcd8739ae039(obj, key, value) {
    if (key in obj) Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
    });
    else obj[key] = value;
    return obj;
}


var $fb96b826c0c5f37a$var$n, $fb96b826c0c5f37a$export$41c562ebe57d11e2, $fb96b826c0c5f37a$var$u, $fb96b826c0c5f37a$export$a8257692ac88316c, $fb96b826c0c5f37a$var$t, $fb96b826c0c5f37a$var$r, $fb96b826c0c5f37a$var$o, $fb96b826c0c5f37a$var$f, $fb96b826c0c5f37a$var$e = {}, $fb96b826c0c5f37a$var$c = [], $fb96b826c0c5f37a$var$s = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
function $fb96b826c0c5f37a$var$a(n1, l1) {
    for(var u1 in l1)n1[u1] = l1[u1];
    return n1;
}
function $fb96b826c0c5f37a$var$h(n2) {
    var l2 = n2.parentNode;
    l2 && l2.removeChild(n2);
}
function $fb96b826c0c5f37a$export$c8a8987d4410bf2d(l3, u2, i1) {
    var t1, r1, o1, f1 = {};
    for(o1 in u2)"key" == o1 ? t1 = u2[o1] : "ref" == o1 ? r1 = u2[o1] : f1[o1] = u2[o1];
    if (arguments.length > 2 && (f1.children = arguments.length > 3 ? $fb96b826c0c5f37a$var$n.call(arguments, 2) : i1), "function" == typeof l3 && null != l3.defaultProps) for(o1 in l3.defaultProps)void 0 === f1[o1] && (f1[o1] = l3.defaultProps[o1]);
    return $fb96b826c0c5f37a$var$y(l3, f1, t1, r1, null);
}
function $fb96b826c0c5f37a$var$y(n3, i2, t2, r2, o2) {
    var f2 = {
        type: n3,
        props: i2,
        key: t2,
        ref: r2,
        __k: null,
        __: null,
        __b: 0,
        __e: null,
        __d: void 0,
        __c: null,
        __h: null,
        constructor: void 0,
        __v: null == o2 ? ++$fb96b826c0c5f37a$var$u : o2
    };
    return null == o2 && null != $fb96b826c0c5f37a$export$41c562ebe57d11e2.vnode && $fb96b826c0c5f37a$export$41c562ebe57d11e2.vnode(f2), f2;
}
function $fb96b826c0c5f37a$export$7d1e3a5e95ceca43() {
    return {
        current: null
    };
}
function $fb96b826c0c5f37a$export$ffb0004e005737fa(n4) {
    return n4.children;
}
function $fb96b826c0c5f37a$export$16fa2f45be04daa8(n5, l4) {
    this.props = n5, this.context = l4;
}
function $fb96b826c0c5f37a$var$k(n6, l5) {
    if (null == l5) return n6.__ ? $fb96b826c0c5f37a$var$k(n6.__, n6.__.__k.indexOf(n6) + 1) : null;
    for(var u3; l5 < n6.__k.length; l5++)if (null != (u3 = n6.__k[l5]) && null != u3.__e) return u3.__e;
    return "function" == typeof n6.type ? $fb96b826c0c5f37a$var$k(n6) : null;
}
function $fb96b826c0c5f37a$var$b(n7) {
    var l6, u4;
    if (null != (n7 = n7.__) && null != n7.__c) {
        for(n7.__e = n7.__c.base = null, l6 = 0; l6 < n7.__k.length; l6++)if (null != (u4 = n7.__k[l6]) && null != u4.__e) {
            n7.__e = n7.__c.base = u4.__e;
            break;
        }
        return $fb96b826c0c5f37a$var$b(n7);
    }
}
function $fb96b826c0c5f37a$var$m(n8) {
    (!n8.__d && (n8.__d = !0) && $fb96b826c0c5f37a$var$t.push(n8) && !$fb96b826c0c5f37a$var$g.__r++ || $fb96b826c0c5f37a$var$o !== $fb96b826c0c5f37a$export$41c562ebe57d11e2.debounceRendering) && (($fb96b826c0c5f37a$var$o = $fb96b826c0c5f37a$export$41c562ebe57d11e2.debounceRendering) || $fb96b826c0c5f37a$var$r)($fb96b826c0c5f37a$var$g);
}
function $fb96b826c0c5f37a$var$g() {
    for(var n9; $fb96b826c0c5f37a$var$g.__r = $fb96b826c0c5f37a$var$t.length;)n9 = $fb96b826c0c5f37a$var$t.sort(function(n10, l7) {
        return n10.__v.__b - l7.__v.__b;
    }), $fb96b826c0c5f37a$var$t = [], n9.some(function(n11) {
        var l8, u5, i3, t3, r3, o3;
        n11.__d && (r3 = (t3 = (l8 = n11).__v).__e, (o3 = l8.__P) && (u5 = [], (i3 = $fb96b826c0c5f37a$var$a({}, t3)).__v = t3.__v + 1, $fb96b826c0c5f37a$var$j(o3, t3, i3, l8.__n, void 0 !== o3.ownerSVGElement, null != t3.__h ? [
            r3
        ] : null, u5, null == r3 ? $fb96b826c0c5f37a$var$k(t3) : r3, t3.__h), $fb96b826c0c5f37a$var$z(u5, t3), t3.__e != r3 && $fb96b826c0c5f37a$var$b(t3)));
    });
}
function $fb96b826c0c5f37a$var$w(n12, l9, u6, i4, t4, r4, o4, f3, s1, a1) {
    var h1, v1, p1, _1, b1, m1, g1, w1 = i4 && i4.__k || $fb96b826c0c5f37a$var$c, A1 = w1.length;
    for(u6.__k = [], h1 = 0; h1 < l9.length; h1++)if (null != (_1 = u6.__k[h1] = null == (_1 = l9[h1]) || "boolean" == typeof _1 ? null : "string" == typeof _1 || "number" == typeof _1 || "bigint" == typeof _1 ? $fb96b826c0c5f37a$var$y(null, _1, null, null, _1) : Array.isArray(_1) ? $fb96b826c0c5f37a$var$y($fb96b826c0c5f37a$export$ffb0004e005737fa, {
        children: _1
    }, null, null, null) : _1.__b > 0 ? $fb96b826c0c5f37a$var$y(_1.type, _1.props, _1.key, null, _1.__v) : _1)) {
        if (_1.__ = u6, _1.__b = u6.__b + 1, null === (p1 = w1[h1]) || p1 && _1.key == p1.key && _1.type === p1.type) w1[h1] = void 0;
        else for(v1 = 0; v1 < A1; v1++){
            if ((p1 = w1[v1]) && _1.key == p1.key && _1.type === p1.type) {
                w1[v1] = void 0;
                break;
            }
            p1 = null;
        }
        $fb96b826c0c5f37a$var$j(n12, _1, p1 = p1 || $fb96b826c0c5f37a$var$e, t4, r4, o4, f3, s1, a1), b1 = _1.__e, (v1 = _1.ref) && p1.ref != v1 && (g1 || (g1 = []), p1.ref && g1.push(p1.ref, null, _1), g1.push(v1, _1.__c || b1, _1)), null != b1 ? (null == m1 && (m1 = b1), "function" == typeof _1.type && _1.__k === p1.__k ? _1.__d = s1 = $fb96b826c0c5f37a$var$x(_1, s1, n12) : s1 = $fb96b826c0c5f37a$var$P(n12, _1, p1, w1, b1, s1), "function" == typeof u6.type && (u6.__d = s1)) : s1 && p1.__e == s1 && s1.parentNode != n12 && (s1 = $fb96b826c0c5f37a$var$k(p1));
    }
    for(u6.__e = m1, h1 = A1; h1--;)null != w1[h1] && ("function" == typeof u6.type && null != w1[h1].__e && w1[h1].__e == u6.__d && (u6.__d = $fb96b826c0c5f37a$var$k(i4, h1 + 1)), $fb96b826c0c5f37a$var$N(w1[h1], w1[h1]));
    if (g1) for(h1 = 0; h1 < g1.length; h1++)$fb96b826c0c5f37a$var$M(g1[h1], g1[++h1], g1[++h1]);
}
function $fb96b826c0c5f37a$var$x(n13, l10, u7) {
    for(var i5, t5 = n13.__k, r5 = 0; t5 && r5 < t5.length; r5++)(i5 = t5[r5]) && (i5.__ = n13, l10 = "function" == typeof i5.type ? $fb96b826c0c5f37a$var$x(i5, l10, u7) : $fb96b826c0c5f37a$var$P(u7, i5, i5, t5, i5.__e, l10));
    return l10;
}
function $fb96b826c0c5f37a$export$47e4c5b300681277(n14, l11) {
    return l11 = l11 || [], null == n14 || "boolean" == typeof n14 || (Array.isArray(n14) ? n14.some(function(n15) {
        $fb96b826c0c5f37a$export$47e4c5b300681277(n15, l11);
    }) : l11.push(n14)), l11;
}
function $fb96b826c0c5f37a$var$P(n16, l12, u8, i6, t6, r6) {
    var o5, f4, e1;
    if (void 0 !== l12.__d) o5 = l12.__d, l12.__d = void 0;
    else if (null == u8 || t6 != r6 || null == t6.parentNode) n: if (null == r6 || r6.parentNode !== n16) n16.appendChild(t6), o5 = null;
    else {
        for(f4 = r6, e1 = 0; (f4 = f4.nextSibling) && e1 < i6.length; e1 += 2)if (f4 == t6) break n;
        n16.insertBefore(t6, r6), o5 = r6;
    }
    return void 0 !== o5 ? o5 : t6.nextSibling;
}
function $fb96b826c0c5f37a$var$C(n17, l13, u9, i7, t7) {
    var r7;
    for(r7 in u9)"children" === r7 || "key" === r7 || r7 in l13 || $fb96b826c0c5f37a$var$H(n17, r7, null, u9[r7], i7);
    for(r7 in l13)t7 && "function" != typeof l13[r7] || "children" === r7 || "key" === r7 || "value" === r7 || "checked" === r7 || u9[r7] === l13[r7] || $fb96b826c0c5f37a$var$H(n17, r7, l13[r7], u9[r7], i7);
}
function $fb96b826c0c5f37a$var$$(n18, l14, u10) {
    "-" === l14[0] ? n18.setProperty(l14, u10) : n18[l14] = null == u10 ? "" : "number" != typeof u10 || $fb96b826c0c5f37a$var$s.test(l14) ? u10 : u10 + "px";
}
function $fb96b826c0c5f37a$var$H(n19, l15, u11, i8, t8) {
    var r8;
    n: if ("style" === l15) {
        if ("string" == typeof u11) n19.style.cssText = u11;
        else {
            if ("string" == typeof i8 && (n19.style.cssText = i8 = ""), i8) for(l15 in i8)u11 && l15 in u11 || $fb96b826c0c5f37a$var$$(n19.style, l15, "");
            if (u11) for(l15 in u11)i8 && u11[l15] === i8[l15] || $fb96b826c0c5f37a$var$$(n19.style, l15, u11[l15]);
        }
    } else if ("o" === l15[0] && "n" === l15[1]) r8 = l15 !== (l15 = l15.replace(/Capture$/, "")), l15 = l15.toLowerCase() in n19 ? l15.toLowerCase().slice(2) : l15.slice(2), n19.l || (n19.l = {}), n19.l[l15 + r8] = u11, u11 ? i8 || n19.addEventListener(l15, r8 ? $fb96b826c0c5f37a$var$T : $fb96b826c0c5f37a$var$I, r8) : n19.removeEventListener(l15, r8 ? $fb96b826c0c5f37a$var$T : $fb96b826c0c5f37a$var$I, r8);
    else if ("dangerouslySetInnerHTML" !== l15) {
        if (t8) l15 = l15.replace(/xlink[H:h]/, "h").replace(/sName$/, "s");
        else if ("href" !== l15 && "list" !== l15 && "form" !== l15 && "tabIndex" !== l15 && "download" !== l15 && l15 in n19) try {
            n19[l15] = null == u11 ? "" : u11;
            break n;
        } catch (n) {}
        "function" == typeof u11 || (null != u11 && (!1 !== u11 || "a" === l15[0] && "r" === l15[1]) ? n19.setAttribute(l15, u11) : n19.removeAttribute(l15));
    }
}
function $fb96b826c0c5f37a$var$I(n20) {
    this.l[n20.type + !1]($fb96b826c0c5f37a$export$41c562ebe57d11e2.event ? $fb96b826c0c5f37a$export$41c562ebe57d11e2.event(n20) : n20);
}
function $fb96b826c0c5f37a$var$T(n21) {
    this.l[n21.type + !0]($fb96b826c0c5f37a$export$41c562ebe57d11e2.event ? $fb96b826c0c5f37a$export$41c562ebe57d11e2.event(n21) : n21);
}
function $fb96b826c0c5f37a$var$j(n22, u12, i9, t9, r9, o6, f5, e2, c1) {
    var s2, h2, v2, y1, p2, k1, b2, m2, g2, x1, A2, P1 = u12.type;
    if (void 0 !== u12.constructor) return null;
    null != i9.__h && (c1 = i9.__h, e2 = u12.__e = i9.__e, u12.__h = null, o6 = [
        e2
    ]), (s2 = $fb96b826c0c5f37a$export$41c562ebe57d11e2.__b) && s2(u12);
    try {
        n: if ("function" == typeof P1) {
            if (m2 = u12.props, g2 = (s2 = P1.contextType) && t9[s2.__c], x1 = s2 ? g2 ? g2.props.value : s2.__ : t9, i9.__c ? b2 = (h2 = u12.__c = i9.__c).__ = h2.__E : ("prototype" in P1 && P1.prototype.render ? u12.__c = h2 = new P1(m2, x1) : (u12.__c = h2 = new $fb96b826c0c5f37a$export$16fa2f45be04daa8(m2, x1), h2.constructor = P1, h2.render = $fb96b826c0c5f37a$var$O), g2 && g2.sub(h2), h2.props = m2, h2.state || (h2.state = {}), h2.context = x1, h2.__n = t9, v2 = h2.__d = !0, h2.__h = []), null == h2.__s && (h2.__s = h2.state), null != P1.getDerivedStateFromProps && (h2.__s == h2.state && (h2.__s = $fb96b826c0c5f37a$var$a({}, h2.__s)), $fb96b826c0c5f37a$var$a(h2.__s, P1.getDerivedStateFromProps(m2, h2.__s))), y1 = h2.props, p2 = h2.state, v2) null == P1.getDerivedStateFromProps && null != h2.componentWillMount && h2.componentWillMount(), null != h2.componentDidMount && h2.__h.push(h2.componentDidMount);
            else {
                if (null == P1.getDerivedStateFromProps && m2 !== y1 && null != h2.componentWillReceiveProps && h2.componentWillReceiveProps(m2, x1), !h2.__e && null != h2.shouldComponentUpdate && !1 === h2.shouldComponentUpdate(m2, h2.__s, x1) || u12.__v === i9.__v) {
                    h2.props = m2, h2.state = h2.__s, u12.__v !== i9.__v && (h2.__d = !1), h2.__v = u12, u12.__e = i9.__e, u12.__k = i9.__k, u12.__k.forEach(function(n23) {
                        n23 && (n23.__ = u12);
                    }), h2.__h.length && f5.push(h2);
                    break n;
                }
                null != h2.componentWillUpdate && h2.componentWillUpdate(m2, h2.__s, x1), null != h2.componentDidUpdate && h2.__h.push(function() {
                    h2.componentDidUpdate(y1, p2, k1);
                });
            }
            h2.context = x1, h2.props = m2, h2.state = h2.__s, (s2 = $fb96b826c0c5f37a$export$41c562ebe57d11e2.__r) && s2(u12), h2.__d = !1, h2.__v = u12, h2.__P = n22, s2 = h2.render(h2.props, h2.state, h2.context), h2.state = h2.__s, null != h2.getChildContext && (t9 = $fb96b826c0c5f37a$var$a($fb96b826c0c5f37a$var$a({}, t9), h2.getChildContext())), v2 || null == h2.getSnapshotBeforeUpdate || (k1 = h2.getSnapshotBeforeUpdate(y1, p2)), A2 = null != s2 && s2.type === $fb96b826c0c5f37a$export$ffb0004e005737fa && null == s2.key ? s2.props.children : s2, $fb96b826c0c5f37a$var$w(n22, Array.isArray(A2) ? A2 : [
                A2
            ], u12, i9, t9, r9, o6, f5, e2, c1), h2.base = u12.__e, u12.__h = null, h2.__h.length && f5.push(h2), b2 && (h2.__E = h2.__ = null), h2.__e = !1;
        } else null == o6 && u12.__v === i9.__v ? (u12.__k = i9.__k, u12.__e = i9.__e) : u12.__e = $fb96b826c0c5f37a$var$L(i9.__e, u12, i9, t9, r9, o6, f5, c1);
        (s2 = $fb96b826c0c5f37a$export$41c562ebe57d11e2.diffed) && s2(u12);
    } catch (n24) {
        u12.__v = null, (c1 || null != o6) && (u12.__e = e2, u12.__h = !!c1, o6[o6.indexOf(e2)] = null), $fb96b826c0c5f37a$export$41c562ebe57d11e2.__e(n24, u12, i9);
    }
}
function $fb96b826c0c5f37a$var$z(n25, u13) {
    $fb96b826c0c5f37a$export$41c562ebe57d11e2.__c && $fb96b826c0c5f37a$export$41c562ebe57d11e2.__c(u13, n25), n25.some(function(u14) {
        try {
            n25 = u14.__h, u14.__h = [], n25.some(function(n26) {
                n26.call(u14);
            });
        } catch (n27) {
            $fb96b826c0c5f37a$export$41c562ebe57d11e2.__e(n27, u14.__v);
        }
    });
}
function $fb96b826c0c5f37a$var$L(l16, u15, i10, t10, r10, o7, f6, c2) {
    var s3, a2, v3, y2 = i10.props, p3 = u15.props, d1 = u15.type, _2 = 0;
    if ("svg" === d1 && (r10 = !0), null != o7) {
        for(; _2 < o7.length; _2++)if ((s3 = o7[_2]) && "setAttribute" in s3 == !!d1 && (d1 ? s3.localName === d1 : 3 === s3.nodeType)) {
            l16 = s3, o7[_2] = null;
            break;
        }
    }
    if (null == l16) {
        if (null === d1) return document.createTextNode(p3);
        l16 = r10 ? document.createElementNS("http://www.w3.org/2000/svg", d1) : document.createElement(d1, p3.is && p3), o7 = null, c2 = !1;
    }
    if (null === d1) y2 === p3 || c2 && l16.data === p3 || (l16.data = p3);
    else {
        if (o7 = o7 && $fb96b826c0c5f37a$var$n.call(l16.childNodes), a2 = (y2 = i10.props || $fb96b826c0c5f37a$var$e).dangerouslySetInnerHTML, v3 = p3.dangerouslySetInnerHTML, !c2) {
            if (null != o7) for(y2 = {}, _2 = 0; _2 < l16.attributes.length; _2++)y2[l16.attributes[_2].name] = l16.attributes[_2].value;
            (v3 || a2) && (v3 && (a2 && v3.__html == a2.__html || v3.__html === l16.innerHTML) || (l16.innerHTML = v3 && v3.__html || ""));
        }
        if ($fb96b826c0c5f37a$var$C(l16, p3, y2, r10, c2), v3) u15.__k = [];
        else if (_2 = u15.props.children, $fb96b826c0c5f37a$var$w(l16, Array.isArray(_2) ? _2 : [
            _2
        ], u15, i10, t10, r10 && "foreignObject" !== d1, o7, f6, o7 ? o7[0] : i10.__k && $fb96b826c0c5f37a$var$k(i10, 0), c2), null != o7) for(_2 = o7.length; _2--;)null != o7[_2] && $fb96b826c0c5f37a$var$h(o7[_2]);
        c2 || ("value" in p3 && void 0 !== (_2 = p3.value) && (_2 !== y2.value || _2 !== l16.value || "progress" === d1 && !_2) && $fb96b826c0c5f37a$var$H(l16, "value", _2, y2.value, !1), "checked" in p3 && void 0 !== (_2 = p3.checked) && _2 !== l16.checked && $fb96b826c0c5f37a$var$H(l16, "checked", _2, y2.checked, !1));
    }
    return l16;
}
function $fb96b826c0c5f37a$var$M(n28, u16, i11) {
    try {
        "function" == typeof n28 ? n28(u16) : n28.current = u16;
    } catch (n29) {
        $fb96b826c0c5f37a$export$41c562ebe57d11e2.__e(n29, i11);
    }
}
function $fb96b826c0c5f37a$var$N(n30, u17, i12) {
    var t11, r11;
    if ($fb96b826c0c5f37a$export$41c562ebe57d11e2.unmount && $fb96b826c0c5f37a$export$41c562ebe57d11e2.unmount(n30), (t11 = n30.ref) && (t11.current && t11.current !== n30.__e || $fb96b826c0c5f37a$var$M(t11, null, u17)), null != (t11 = n30.__c)) {
        if (t11.componentWillUnmount) try {
            t11.componentWillUnmount();
        } catch (n31) {
            $fb96b826c0c5f37a$export$41c562ebe57d11e2.__e(n31, u17);
        }
        t11.base = t11.__P = null;
    }
    if (t11 = n30.__k) for(r11 = 0; r11 < t11.length; r11++)t11[r11] && $fb96b826c0c5f37a$var$N(t11[r11], u17, "function" != typeof n30.type);
    i12 || null == n30.__e || $fb96b826c0c5f37a$var$h(n30.__e), n30.__e = n30.__d = void 0;
}
function $fb96b826c0c5f37a$var$O(n32, l, u18) {
    return this.constructor(n32, u18);
}
function $fb96b826c0c5f37a$export$b3890eb0ae9dca99(u19, i13, t12) {
    var r12, o8, f7;
    $fb96b826c0c5f37a$export$41c562ebe57d11e2.__ && $fb96b826c0c5f37a$export$41c562ebe57d11e2.__(u19, i13), o8 = (r12 = "function" == typeof t12) ? null : t12 && t12.__k || i13.__k, f7 = [], $fb96b826c0c5f37a$var$j(i13, u19 = (!r12 && t12 || i13).__k = $fb96b826c0c5f37a$export$c8a8987d4410bf2d($fb96b826c0c5f37a$export$ffb0004e005737fa, null, [
        u19
    ]), o8 || $fb96b826c0c5f37a$var$e, $fb96b826c0c5f37a$var$e, void 0 !== i13.ownerSVGElement, !r12 && t12 ? [
        t12
    ] : o8 ? null : i13.firstChild ? $fb96b826c0c5f37a$var$n.call(i13.childNodes) : null, f7, !r12 && t12 ? t12 : o8 ? o8.__e : i13.firstChild, r12), $fb96b826c0c5f37a$var$z(f7, u19);
}
function $fb96b826c0c5f37a$export$fa8d919ba61d84db(n33, l17) {
    $fb96b826c0c5f37a$export$b3890eb0ae9dca99(n33, l17, $fb96b826c0c5f37a$export$fa8d919ba61d84db);
}
function $fb96b826c0c5f37a$export$e530037191fcd5d7(l18, u20, i14) {
    var t13, r13, o9, f8 = $fb96b826c0c5f37a$var$a({}, l18.props);
    for(o9 in u20)"key" == o9 ? t13 = u20[o9] : "ref" == o9 ? r13 = u20[o9] : f8[o9] = u20[o9];
    return arguments.length > 2 && (f8.children = arguments.length > 3 ? $fb96b826c0c5f37a$var$n.call(arguments, 2) : i14), $fb96b826c0c5f37a$var$y(l18.type, f8, t13 || l18.key, r13 || l18.ref, null);
}
function $fb96b826c0c5f37a$export$fd42f52fd3ae1109(n34, l19) {
    var u21 = {
        __c: l19 = "__cC" + $fb96b826c0c5f37a$var$f++,
        __: n34,
        Consumer: function(n35, l20) {
            return n35.children(l20);
        },
        Provider: function(n36) {
            var u22, i15;
            return this.getChildContext || (u22 = [], (i15 = {})[l19] = this, this.getChildContext = function() {
                return i15;
            }, this.shouldComponentUpdate = function(n37) {
                this.props.value !== n37.value && u22.some($fb96b826c0c5f37a$var$m);
            }, this.sub = function(n38) {
                u22.push(n38);
                var l21 = n38.componentWillUnmount;
                n38.componentWillUnmount = function() {
                    u22.splice(u22.indexOf(n38), 1), l21 && l21.call(n38);
                };
            }), n36.children;
        }
    };
    return u21.Provider.__ = u21.Consumer.contextType = u21;
}
$fb96b826c0c5f37a$var$n = $fb96b826c0c5f37a$var$c.slice, $fb96b826c0c5f37a$export$41c562ebe57d11e2 = {
    __e: function(n39, l22) {
        for(var u23, i16, t14; l22 = l22.__;)if ((u23 = l22.__c) && !u23.__) try {
            if ((i16 = u23.constructor) && null != i16.getDerivedStateFromError && (u23.setState(i16.getDerivedStateFromError(n39)), t14 = u23.__d), null != u23.componentDidCatch && (u23.componentDidCatch(n39), t14 = u23.__d), t14) return u23.__E = u23;
        } catch (l23) {
            n39 = l23;
        }
        throw n39;
    }
}, $fb96b826c0c5f37a$var$u = 0, $fb96b826c0c5f37a$export$a8257692ac88316c = function(n40) {
    return null != n40 && void 0 === n40.constructor;
}, $fb96b826c0c5f37a$export$16fa2f45be04daa8.prototype.setState = function(n41, l24) {
    var u24;
    u24 = null != this.__s && this.__s !== this.state ? this.__s : this.__s = $fb96b826c0c5f37a$var$a({}, this.state), "function" == typeof n41 && (n41 = n41($fb96b826c0c5f37a$var$a({}, u24), this.props)), n41 && $fb96b826c0c5f37a$var$a(u24, n41), null != n41 && this.__v && (l24 && this.__h.push(l24), $fb96b826c0c5f37a$var$m(this));
}, $fb96b826c0c5f37a$export$16fa2f45be04daa8.prototype.forceUpdate = function(n42) {
    this.__v && (this.__e = !0, n42 && this.__h.push(n42), $fb96b826c0c5f37a$var$m(this));
}, $fb96b826c0c5f37a$export$16fa2f45be04daa8.prototype.render = $fb96b826c0c5f37a$export$ffb0004e005737fa, $fb96b826c0c5f37a$var$t = [], $fb96b826c0c5f37a$var$r = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, $fb96b826c0c5f37a$var$g.__r = 0, $fb96b826c0c5f37a$var$f = 0;



var $bd9dd35321b03dd4$var$o = 0;
function $bd9dd35321b03dd4$export$34b9dba7ce09269b(_1, e1, n, t, f) {
    var l, s, u = {};
    for(s in e1)"ref" == s ? l = e1[s] : u[s] = e1[s];
    var a = {
        type: _1,
        props: u,
        key: n,
        ref: l,
        __k: null,
        __: null,
        __b: 0,
        __e: null,
        __d: void 0,
        __c: null,
        __h: null,
        constructor: void 0,
        __v: --$bd9dd35321b03dd4$var$o,
        __source: t,
        __self: f
    };
    if ("function" == typeof _1 && (l = _1.defaultProps)) for(s in l)void 0 === u[s] && (u[s] = l[s]);
    return (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).vnode && (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).vnode(a), a;
}



function $f72b75cf796873c7$var$set(key, value) {
    try {
        window.localStorage[`emoji-mart.${key}`] = JSON.stringify(value);
    } catch (error) {}
}
function $f72b75cf796873c7$var$get(key) {
    try {
        const value = window.localStorage[`emoji-mart.${key}`];
        if (value) return JSON.parse(value);
    } catch (error) {}
}
var $f72b75cf796873c7$export$2e2bcd8739ae039 = {
    set: $f72b75cf796873c7$var$set,
    get: $f72b75cf796873c7$var$get
};


const $c84d045dcc34faf5$var$CACHE = new Map();
const $c84d045dcc34faf5$var$VERSIONS = [
    {
        v: 15,
        emoji: "\uD83E\uDEE8"
    },
    {
        v: 14,
        emoji: "\uD83E\uDEE0"
    },
    {
        v: 13.1,
        emoji: "\uD83D\uDE36\u200D\uD83C\uDF2B\uFE0F"
    },
    {
        v: 13,
        emoji: "\uD83E\uDD78"
    },
    {
        v: 12.1,
        emoji: "\uD83E\uDDD1\u200D\uD83E\uDDB0"
    },
    {
        v: 12,
        emoji: "\uD83E\uDD71"
    },
    {
        v: 11,
        emoji: "\uD83E\uDD70"
    },
    {
        v: 5,
        emoji: "\uD83E\uDD29"
    },
    {
        v: 4,
        emoji: "\uD83D\uDC71\u200D\u2640\uFE0F"
    },
    {
        v: 3,
        emoji: "\uD83E\uDD23"
    },
    {
        v: 2,
        emoji: "\uD83D\uDC4B\uD83C\uDFFB"
    },
    {
        v: 1,
        emoji: "\uD83D\uDE43"
    }, 
];
function $c84d045dcc34faf5$var$latestVersion() {
    for (const { v: v , emoji: emoji  } of $c84d045dcc34faf5$var$VERSIONS){
        if ($c84d045dcc34faf5$var$isSupported(emoji)) return v;
    }
}
function $c84d045dcc34faf5$var$noCountryFlags() {
    if ($c84d045dcc34faf5$var$isSupported("\uD83C\uDDE8\uD83C\uDDE6")) return false;
    return true;
}
function $c84d045dcc34faf5$var$isSupported(emoji) {
    if ($c84d045dcc34faf5$var$CACHE.has(emoji)) return $c84d045dcc34faf5$var$CACHE.get(emoji);
    const supported = $c84d045dcc34faf5$var$isEmojiSupported(emoji);
    $c84d045dcc34faf5$var$CACHE.set(emoji, supported);
    return supported;
}
// https://github.com/koala-interactive/is-emoji-supported
const $c84d045dcc34faf5$var$isEmojiSupported = (()=>{
    let ctx = null;
    try {
        if (!navigator.userAgent.includes("jsdom")) ctx = document.createElement("canvas").getContext("2d", {
            willReadFrequently: true
        });
    } catch  {}
    // Not in browser env
    if (!ctx) return ()=>false;
    const CANVAS_HEIGHT = 25;
    const CANVAS_WIDTH = 20;
    const textSize = Math.floor(CANVAS_HEIGHT / 2);
    // Initialize convas context
    ctx.font = textSize + "px Arial, Sans-Serif";
    ctx.textBaseline = "top";
    ctx.canvas.width = CANVAS_WIDTH * 2;
    ctx.canvas.height = CANVAS_HEIGHT;
    return (unicode)=>{
        ctx.clearRect(0, 0, CANVAS_WIDTH * 2, CANVAS_HEIGHT);
        // Draw in red on the left
        ctx.fillStyle = "#FF0000";
        ctx.fillText(unicode, 0, 22);
        // Draw in blue on right
        ctx.fillStyle = "#0000FF";
        ctx.fillText(unicode, CANVAS_WIDTH, 22);
        const a = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
        const count = a.length;
        let i = 0;
        // Search the first visible pixel
        for(; i < count && !a[i + 3]; i += 4);
        // No visible pixel
        if (i >= count) return false;
        // Emoji has immutable color, so we check the color of the emoji in two different colors
        // the result show be the same.
        const x = CANVAS_WIDTH + i / 4 % CANVAS_WIDTH;
        const y = Math.floor(i / 4 / CANVAS_WIDTH);
        const b = ctx.getImageData(x, y, 1, 1).data;
        if (a[i] !== b[0] || a[i + 2] !== b[2]) return false;
        // Some emojis are a contraction of different ones, so if it's not
        // supported, it will show multiple characters
        if (ctx.measureText(unicode).width >= CANVAS_WIDTH) return false;
        // Supported
        return true;
    };
})();
var $c84d045dcc34faf5$export$2e2bcd8739ae039 = {
    latestVersion: $c84d045dcc34faf5$var$latestVersion,
    noCountryFlags: $c84d045dcc34faf5$var$noCountryFlags
};



const $b22cfd0a55410b4f$var$DEFAULTS = [
    "+1",
    "grinning",
    "kissing_heart",
    "heart_eyes",
    "laughing",
    "stuck_out_tongue_winking_eye",
    "sweat_smile",
    "joy",
    "scream",
    "disappointed",
    "unamused",
    "weary",
    "sob",
    "sunglasses",
    "heart", 
];
let $b22cfd0a55410b4f$var$Index = null;
function $b22cfd0a55410b4f$var$add(emoji) {
    $b22cfd0a55410b4f$var$Index || ($b22cfd0a55410b4f$var$Index = (0, $f72b75cf796873c7$export$2e2bcd8739ae039).get("frequently") || {});
    const emojiId = emoji.id || emoji;
    if (!emojiId) return;
    $b22cfd0a55410b4f$var$Index[emojiId] || ($b22cfd0a55410b4f$var$Index[emojiId] = 0);
    $b22cfd0a55410b4f$var$Index[emojiId] += 1;
    (0, $f72b75cf796873c7$export$2e2bcd8739ae039).set("last", emojiId);
    (0, $f72b75cf796873c7$export$2e2bcd8739ae039).set("frequently", $b22cfd0a55410b4f$var$Index);
}
function $b22cfd0a55410b4f$var$get({ maxFrequentRows: maxFrequentRows , perLine: perLine  }) {
    if (!maxFrequentRows) return [];
    $b22cfd0a55410b4f$var$Index || ($b22cfd0a55410b4f$var$Index = (0, $f72b75cf796873c7$export$2e2bcd8739ae039).get("frequently"));
    let emojiIds = [];
    if (!$b22cfd0a55410b4f$var$Index) {
        $b22cfd0a55410b4f$var$Index = {};
        for(let i in $b22cfd0a55410b4f$var$DEFAULTS.slice(0, perLine)){
            const emojiId = $b22cfd0a55410b4f$var$DEFAULTS[i];
            $b22cfd0a55410b4f$var$Index[emojiId] = perLine - i;
            emojiIds.push(emojiId);
        }
        return emojiIds;
    }
    const max = maxFrequentRows * perLine;
    const last = (0, $f72b75cf796873c7$export$2e2bcd8739ae039).get("last");
    for(let emojiId in $b22cfd0a55410b4f$var$Index)emojiIds.push(emojiId);
    emojiIds.sort((a, b)=>{
        const aScore = $b22cfd0a55410b4f$var$Index[b];
        const bScore = $b22cfd0a55410b4f$var$Index[a];
        if (aScore == bScore) return a.localeCompare(b);
        return aScore - bScore;
    });
    if (emojiIds.length > max) {
        const removedIds = emojiIds.slice(max);
        emojiIds = emojiIds.slice(0, max);
        for (let removedId of removedIds){
            if (removedId == last) continue;
            delete $b22cfd0a55410b4f$var$Index[removedId];
        }
        if (last && emojiIds.indexOf(last) == -1) {
            delete $b22cfd0a55410b4f$var$Index[emojiIds[emojiIds.length - 1]];
            emojiIds.splice(-1, 1, last);
        }
        (0, $f72b75cf796873c7$export$2e2bcd8739ae039).set("frequently", $b22cfd0a55410b4f$var$Index);
    }
    return emojiIds;
}
var $b22cfd0a55410b4f$export$2e2bcd8739ae039 = {
    add: $b22cfd0a55410b4f$var$add,
    get: $b22cfd0a55410b4f$var$get,
    DEFAULTS: $b22cfd0a55410b4f$var$DEFAULTS
};


var $8d50d93417ef682a$exports = {};
$8d50d93417ef682a$exports = JSON.parse('{"search":"Search","search_no_results_1":"Oh no!","search_no_results_2":"That emoji couldn\u2019t be found","pick":"Pick an emoji\u2026","add_custom":"Add custom emoji","categories":{"activity":"Activity","custom":"Custom","flags":"Flags","foods":"Food & Drink","frequent":"Frequently used","nature":"Animals & Nature","objects":"Objects","people":"Smileys & People","places":"Travel & Places","search":"Search Results","symbols":"Symbols"},"skins":{"1":"Default","2":"Light","3":"Medium-Light","4":"Medium","5":"Medium-Dark","6":"Dark","choose":"Choose default skin tone"}}');


var $b247ea80b67298d5$export$2e2bcd8739ae039 = {
    autoFocus: {
        value: false
    },
    dynamicWidth: {
        value: false
    },
    emojiButtonColors: {
        value: null
    },
    emojiButtonRadius: {
        value: "100%"
    },
    emojiButtonSize: {
        value: 36
    },
    emojiSize: {
        value: 24
    },
    emojiVersion: {
        value: 15,
        choices: [
            1,
            2,
            3,
            4,
            5,
            11,
            12,
            12.1,
            13,
            13.1,
            14,
            15
        ]
    },
    exceptEmojis: {
        value: []
    },
    icons: {
        value: "auto",
        choices: [
            "auto",
            "outline",
            "solid"
        ]
    },
    locale: {
        value: "en",
        choices: [
            "en",
            "ar",
            "be",
            "cs",
            "de",
            "es",
            "fa",
            "fi",
            "fr",
            "hi",
            "it",
            "ja",
            "ko",
            "nl",
            "pl",
            "pt",
            "ru",
            "sa",
            "tr",
            "uk",
            "vi",
            "zh", 
        ]
    },
    maxFrequentRows: {
        value: 4
    },
    navPosition: {
        value: "top",
        choices: [
            "top",
            "bottom",
            "none"
        ]
    },
    noCountryFlags: {
        value: false
    },
    noResultsEmoji: {
        value: null
    },
    perLine: {
        value: 9
    },
    previewEmoji: {
        value: null
    },
    previewPosition: {
        value: "bottom",
        choices: [
            "top",
            "bottom",
            "none"
        ]
    },
    searchPosition: {
        value: "sticky",
        choices: [
            "sticky",
            "static",
            "none"
        ]
    },
    set: {
        value: "native",
        choices: [
            "native",
            "apple",
            "facebook",
            "google",
            "twitter"
        ]
    },
    skin: {
        value: 1,
        choices: [
            1,
            2,
            3,
            4,
            5,
            6
        ]
    },
    skinTonePosition: {
        value: "preview",
        choices: [
            "preview",
            "search",
            "none"
        ]
    },
    theme: {
        value: "auto",
        choices: [
            "auto",
            "light",
            "dark"
        ]
    },
    // Data
    categories: null,
    categoryIcons: null,
    custom: null,
    data: null,
    i18n: null,
    // Callbacks
    getImageURL: null,
    getSpritesheetURL: null,
    onAddCustomEmoji: null,
    onClickOutside: null,
    onEmojiSelect: null,
    // Deprecated
    stickySearch: {
        deprecated: true,
        value: true
    }
};



let $7adb23b0109cc36a$export$dbe3113d60765c1a = null;
let $7adb23b0109cc36a$export$2d0294657ab35f1b = null;
const $7adb23b0109cc36a$var$fetchCache = {};
async function $7adb23b0109cc36a$var$fetchJSON(src) {
    if ($7adb23b0109cc36a$var$fetchCache[src]) return $7adb23b0109cc36a$var$fetchCache[src];
    const response = await fetch(src);
    const json = await response.json();
    $7adb23b0109cc36a$var$fetchCache[src] = json;
    return json;
}
let $7adb23b0109cc36a$var$promise = null;
let $7adb23b0109cc36a$var$initiated = false;
let $7adb23b0109cc36a$var$initCallback = null;
let $7adb23b0109cc36a$var$initialized = false;
function $7adb23b0109cc36a$export$2cd8252107eb640b(options, { caller: caller  } = {}) {
    $7adb23b0109cc36a$var$promise || ($7adb23b0109cc36a$var$promise = new Promise((resolve)=>{
        $7adb23b0109cc36a$var$initCallback = resolve;
    }));
    if (options) $7adb23b0109cc36a$var$_init(options);
    else if (caller && !$7adb23b0109cc36a$var$initialized) console.warn(`\`${caller}\` requires data to be initialized first. Promise will be pending until \`init\` is called.`);
    return $7adb23b0109cc36a$var$promise;
}
async function $7adb23b0109cc36a$var$_init(props) {
    $7adb23b0109cc36a$var$initialized = true;
    let { emojiVersion: emojiVersion , set: set , locale: locale  } = props;
    emojiVersion || (emojiVersion = (0, $b247ea80b67298d5$export$2e2bcd8739ae039).emojiVersion.value);
    set || (set = (0, $b247ea80b67298d5$export$2e2bcd8739ae039).set.value);
    locale || (locale = (0, $b247ea80b67298d5$export$2e2bcd8739ae039).locale.value);
    if (!$7adb23b0109cc36a$export$2d0294657ab35f1b) {
        $7adb23b0109cc36a$export$2d0294657ab35f1b = (typeof props.data === "function" ? await props.data() : props.data) || await $7adb23b0109cc36a$var$fetchJSON(`https://cdn.jsdelivr.net/npm/@emoji-mart/data@latest/sets/${emojiVersion}/${set}.json`);
        $7adb23b0109cc36a$export$2d0294657ab35f1b.emoticons = {};
        $7adb23b0109cc36a$export$2d0294657ab35f1b.natives = {};
        $7adb23b0109cc36a$export$2d0294657ab35f1b.categories.unshift({
            id: "frequent",
            emojis: []
        });
        for(const alias in $7adb23b0109cc36a$export$2d0294657ab35f1b.aliases){
            const emojiId = $7adb23b0109cc36a$export$2d0294657ab35f1b.aliases[alias];
            const emoji = $7adb23b0109cc36a$export$2d0294657ab35f1b.emojis[emojiId];
            if (!emoji) continue;
            emoji.aliases || (emoji.aliases = []);
            emoji.aliases.push(alias);
        }
        $7adb23b0109cc36a$export$2d0294657ab35f1b.originalCategories = $7adb23b0109cc36a$export$2d0294657ab35f1b.categories;
    } else $7adb23b0109cc36a$export$2d0294657ab35f1b.categories = $7adb23b0109cc36a$export$2d0294657ab35f1b.categories.filter((c)=>{
        const isCustom = !!c.name;
        if (!isCustom) return true;
        return false;
    });
    $7adb23b0109cc36a$export$dbe3113d60765c1a = (typeof props.i18n === "function" ? await props.i18n() : props.i18n) || (locale == "en" ? (0, (/*@__PURE__*/$parcel$interopDefault($8d50d93417ef682a$exports))) : await $7adb23b0109cc36a$var$fetchJSON(`https://cdn.jsdelivr.net/npm/@emoji-mart/data@latest/i18n/${locale}.json`));
    if (props.custom) for(let i in props.custom){
        i = parseInt(i);
        const category = props.custom[i];
        const prevCategory = props.custom[i - 1];
        if (!category.emojis || !category.emojis.length) continue;
        category.id || (category.id = `custom_${i + 1}`);
        category.name || (category.name = $7adb23b0109cc36a$export$dbe3113d60765c1a.categories.custom);
        if (prevCategory && !category.icon) category.target = prevCategory.target || prevCategory;
        $7adb23b0109cc36a$export$2d0294657ab35f1b.categories.push(category);
        for (const emoji of category.emojis)$7adb23b0109cc36a$export$2d0294657ab35f1b.emojis[emoji.id] = emoji;
    }
    if (props.categories) $7adb23b0109cc36a$export$2d0294657ab35f1b.categories = $7adb23b0109cc36a$export$2d0294657ab35f1b.originalCategories.filter((c)=>{
        return props.categories.indexOf(c.id) != -1;
    }).sort((c1, c2)=>{
        const i1 = props.categories.indexOf(c1.id);
        const i2 = props.categories.indexOf(c2.id);
        return i1 - i2;
    });
    let latestVersionSupport = null;
    let noCountryFlags = null;
    if (set == "native") {
        latestVersionSupport = (0, $c84d045dcc34faf5$export$2e2bcd8739ae039).latestVersion();
        noCountryFlags = props.noCountryFlags || (0, $c84d045dcc34faf5$export$2e2bcd8739ae039).noCountryFlags();
    }
    let categoryIndex = $7adb23b0109cc36a$export$2d0294657ab35f1b.categories.length;
    let resetSearchIndex = false;
    while(categoryIndex--){
        const category = $7adb23b0109cc36a$export$2d0294657ab35f1b.categories[categoryIndex];
        if (category.id == "frequent") {
            let { maxFrequentRows: maxFrequentRows , perLine: perLine  } = props;
            maxFrequentRows = maxFrequentRows >= 0 ? maxFrequentRows : (0, $b247ea80b67298d5$export$2e2bcd8739ae039).maxFrequentRows.value;
            perLine || (perLine = (0, $b247ea80b67298d5$export$2e2bcd8739ae039).perLine.value);
            category.emojis = (0, $b22cfd0a55410b4f$export$2e2bcd8739ae039).get({
                maxFrequentRows: maxFrequentRows,
                perLine: perLine
            });
        }
        if (!category.emojis || !category.emojis.length) {
            $7adb23b0109cc36a$export$2d0294657ab35f1b.categories.splice(categoryIndex, 1);
            continue;
        }
        const { categoryIcons: categoryIcons  } = props;
        if (categoryIcons) {
            const icon = categoryIcons[category.id];
            if (icon && !category.icon) category.icon = icon;
        }
        let emojiIndex = category.emojis.length;
        while(emojiIndex--){
            const emojiId = category.emojis[emojiIndex];
            const emoji = emojiId.id ? emojiId : $7adb23b0109cc36a$export$2d0294657ab35f1b.emojis[emojiId];
            const ignore = ()=>{
                category.emojis.splice(emojiIndex, 1);
            };
            if (!emoji || props.exceptEmojis && props.exceptEmojis.includes(emoji.id)) {
                ignore();
                continue;
            }
            if (latestVersionSupport && emoji.version > latestVersionSupport) {
                ignore();
                continue;
            }
            if (noCountryFlags && category.id == "flags") {
                if (!(0, $e6eae5155b87f591$export$bcb25aa587e9cb13).includes(emoji.id)) {
                    ignore();
                    continue;
                }
            }
            if (!emoji.search) {
                resetSearchIndex = true;
                emoji.search = "," + [
                    [
                        emoji.id,
                        false
                    ],
                    [
                        emoji.name,
                        true
                    ],
                    [
                        emoji.keywords,
                        false
                    ],
                    [
                        emoji.emoticons,
                        false
                    ], 
                ].map(([strings, split])=>{
                    if (!strings) return;
                    return (Array.isArray(strings) ? strings : [
                        strings
                    ]).map((string)=>{
                        return (split ? string.split(/[-|_|\s]+/) : [
                            string
                        ]).map((s)=>s.toLowerCase());
                    }).flat();
                }).flat().filter((a)=>a && a.trim()).join(",");
                if (emoji.emoticons) for (const emoticon of emoji.emoticons){
                    if ($7adb23b0109cc36a$export$2d0294657ab35f1b.emoticons[emoticon]) continue;
                    $7adb23b0109cc36a$export$2d0294657ab35f1b.emoticons[emoticon] = emoji.id;
                }
                let skinIndex = 0;
                for (const skin of emoji.skins){
                    if (!skin) continue;
                    skinIndex++;
                    const { native: native  } = skin;
                    if (native) {
                        $7adb23b0109cc36a$export$2d0294657ab35f1b.natives[native] = emoji.id;
                        emoji.search += `,${native}`;
                    }
                    const skinShortcodes = skinIndex == 1 ? "" : `:skin-tone-${skinIndex}:`;
                    skin.shortcodes = `:${emoji.id}:${skinShortcodes}`;
                }
            }
        }
    }
    if (resetSearchIndex) (0, $c4d155af13ad4d4b$export$2e2bcd8739ae039).reset();
    $7adb23b0109cc36a$var$initCallback();
}
function $7adb23b0109cc36a$export$75fe5f91d452f94b(props, defaultProps, element) {
    props || (props = {});
    const _props = {};
    for(let k in defaultProps)_props[k] = $7adb23b0109cc36a$export$88c9ddb45cea7241(k, props, defaultProps, element);
    return _props;
}
function $7adb23b0109cc36a$export$88c9ddb45cea7241(propName, props, defaultProps, element) {
    const defaults = defaultProps[propName];
    let value = element && element.getAttribute(propName) || (props[propName] != null && props[propName] != undefined ? props[propName] : null);
    if (!defaults) return value;
    if (value != null && defaults.value && typeof defaults.value != typeof value) {
        if (typeof defaults.value == "boolean") value = value == "false" ? false : true;
        else value = defaults.value.constructor(value);
    }
    if (defaults.transform && value) value = defaults.transform(value);
    if (value == null || defaults.choices && defaults.choices.indexOf(value) == -1) value = defaults.value;
    return value;
}


const $c4d155af13ad4d4b$var$SHORTCODES_REGEX = /^(?:\:([^\:]+)\:)(?:\:skin-tone-(\d)\:)?$/;
let $c4d155af13ad4d4b$var$Pool = null;
function $c4d155af13ad4d4b$var$get(emojiId) {
    if (emojiId.id) return emojiId;
    return (0, $7adb23b0109cc36a$export$2d0294657ab35f1b).emojis[emojiId] || (0, $7adb23b0109cc36a$export$2d0294657ab35f1b).emojis[(0, $7adb23b0109cc36a$export$2d0294657ab35f1b).aliases[emojiId]] || (0, $7adb23b0109cc36a$export$2d0294657ab35f1b).emojis[(0, $7adb23b0109cc36a$export$2d0294657ab35f1b).natives[emojiId]];
}
function $c4d155af13ad4d4b$var$reset() {
    $c4d155af13ad4d4b$var$Pool = null;
}
async function $c4d155af13ad4d4b$var$search(value, { maxResults: maxResults , caller: caller  } = {}) {
    if (!value || !value.trim().length) return null;
    maxResults || (maxResults = 90);
    await (0, $7adb23b0109cc36a$export$2cd8252107eb640b)(null, {
        caller: caller || "SearchIndex.search"
    });
    const values = value.toLowerCase().replace(/(\w)-/, "$1 ").split(/[\s|,]+/).filter((word, i, words)=>{
        return word.trim() && words.indexOf(word) == i;
    });
    if (!values.length) return;
    let pool = $c4d155af13ad4d4b$var$Pool || ($c4d155af13ad4d4b$var$Pool = Object.values((0, $7adb23b0109cc36a$export$2d0294657ab35f1b).emojis));
    let results, scores;
    for (const value1 of values){
        if (!pool.length) break;
        results = [];
        scores = {};
        for (const emoji of pool){
            if (!emoji.search) continue;
            const score = emoji.search.indexOf(`,${value1}`);
            if (score == -1) continue;
            results.push(emoji);
            scores[emoji.id] || (scores[emoji.id] = 0);
            scores[emoji.id] += emoji.id == value1 ? 0 : score + 1;
        }
        pool = results;
    }
    if (results.length < 2) return results;
    results.sort((a, b)=>{
        const aScore = scores[a.id];
        const bScore = scores[b.id];
        if (aScore == bScore) return a.id.localeCompare(b.id);
        return aScore - bScore;
    });
    if (results.length > maxResults) results = results.slice(0, maxResults);
    return results;
}
var $c4d155af13ad4d4b$export$2e2bcd8739ae039 = {
    search: $c4d155af13ad4d4b$var$search,
    get: $c4d155af13ad4d4b$var$get,
    reset: $c4d155af13ad4d4b$var$reset,
    SHORTCODES_REGEX: $c4d155af13ad4d4b$var$SHORTCODES_REGEX
};


const $e6eae5155b87f591$export$bcb25aa587e9cb13 = [
    "checkered_flag",
    "crossed_flags",
    "pirate_flag",
    "rainbow-flag",
    "transgender_flag",
    "triangular_flag_on_post",
    "waving_black_flag",
    "waving_white_flag", 
];


function $693b183b0a78708f$export$9cb4719e2e525b7a(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((val, index)=>val == b[index]);
}
async function $693b183b0a78708f$export$e772c8ff12451969(frames = 1) {
    for(let _ in [
        ...Array(frames).keys()
    ])await new Promise(requestAnimationFrame);
}
function $693b183b0a78708f$export$d10ac59fbe52a745(emoji, { skinIndex: skinIndex = 0  } = {}) {
    const skin = emoji.skins[skinIndex] || (()=>{
        skinIndex = 0;
        return emoji.skins[skinIndex];
    })();
    const emojiData = {
        id: emoji.id,
        name: emoji.name,
        native: skin.native,
        unified: skin.unified,
        keywords: emoji.keywords,
        shortcodes: skin.shortcodes || emoji.shortcodes
    };
    if (emoji.skins.length > 1) emojiData.skin = skinIndex + 1;
    if (skin.src) emojiData.src = skin.src;
    if (emoji.aliases && emoji.aliases.length) emojiData.aliases = emoji.aliases;
    if (emoji.emoticons && emoji.emoticons.length) emojiData.emoticons = emoji.emoticons;
    return emojiData;
}
async function $693b183b0a78708f$export$5ef5574deca44bc0(nativeString) {
    const results = await (0, $c4d155af13ad4d4b$export$2e2bcd8739ae039).search(nativeString, {
        maxResults: 1,
        caller: "getEmojiDataFromNative"
    });
    if (!results || !results.length) return null;
    const emoji = results[0];
    let skinIndex = 0;
    for (let skin of emoji.skins){
        if (skin.native == nativeString) break;
        skinIndex++;
    }
    return $693b183b0a78708f$export$d10ac59fbe52a745(emoji, {
        skinIndex: skinIndex
    });
}





const $fcccfb36ed0cde68$var$categories = {
    activity: {
        outline: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M12 0C5.373 0 0 5.372 0 12c0 6.627 5.373 12 12 12 6.628 0 12-5.373 12-12 0-6.628-5.372-12-12-12m9.949 11H17.05c.224-2.527 1.232-4.773 1.968-6.113A9.966 9.966 0 0 1 21.949 11M13 11V2.051a9.945 9.945 0 0 1 4.432 1.564c-.858 1.491-2.156 4.22-2.392 7.385H13zm-2 0H8.961c-.238-3.165-1.536-5.894-2.393-7.385A9.95 9.95 0 0 1 11 2.051V11zm0 2v8.949a9.937 9.937 0 0 1-4.432-1.564c.857-1.492 2.155-4.221 2.393-7.385H11zm4.04 0c.236 3.164 1.534 5.893 2.392 7.385A9.92 9.92 0 0 1 13 21.949V13h2.04zM4.982 4.887C5.718 6.227 6.726 8.473 6.951 11h-4.9a9.977 9.977 0 0 1 2.931-6.113M2.051 13h4.9c-.226 2.527-1.233 4.771-1.969 6.113A9.972 9.972 0 0 1 2.051 13m16.967 6.113c-.735-1.342-1.744-3.586-1.968-6.113h4.899a9.961 9.961 0 0 1-2.931 6.113"
            })
        }),
        solid: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M16.17 337.5c0 44.98 7.565 83.54 13.98 107.9C35.22 464.3 50.46 496 174.9 496c9.566 0 19.59-.4707 29.84-1.271L17.33 307.3C16.53 317.6 16.17 327.7 16.17 337.5zM495.8 174.5c0-44.98-7.565-83.53-13.98-107.9c-4.688-17.54-18.34-31.23-36.04-35.95C435.5 27.91 392.9 16 337 16c-9.564 0-19.59 .4707-29.84 1.271l187.5 187.5C495.5 194.4 495.8 184.3 495.8 174.5zM26.77 248.8l236.3 236.3c142-36.1 203.9-150.4 222.2-221.1L248.9 26.87C106.9 62.96 45.07 177.2 26.77 248.8zM256 335.1c0 9.141-7.474 16-16 16c-4.094 0-8.188-1.564-11.31-4.689L164.7 283.3C161.6 280.2 160 276.1 160 271.1c0-8.529 6.865-16 16-16c4.095 0 8.189 1.562 11.31 4.688l64.01 64C254.4 327.8 256 331.9 256 335.1zM304 287.1c0 9.141-7.474 16-16 16c-4.094 0-8.188-1.564-11.31-4.689L212.7 235.3C209.6 232.2 208 228.1 208 223.1c0-9.141 7.473-16 16-16c4.094 0 8.188 1.562 11.31 4.688l64.01 64.01C302.5 279.8 304 283.9 304 287.1zM256 175.1c0-9.141 7.473-16 16-16c4.094 0 8.188 1.562 11.31 4.688l64.01 64.01c3.125 3.125 4.688 7.219 4.688 11.31c0 9.133-7.468 16-16 16c-4.094 0-8.189-1.562-11.31-4.688l-64.01-64.01C257.6 184.2 256 180.1 256 175.1z"
            })
        })
    },
    custom: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 448 512",
        children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
            d: "M417.1 368c-5.937 10.27-16.69 16-27.75 16c-5.422 0-10.92-1.375-15.97-4.281L256 311.4V448c0 17.67-14.33 32-31.1 32S192 465.7 192 448V311.4l-118.3 68.29C68.67 382.6 63.17 384 57.75 384c-11.06 0-21.81-5.734-27.75-16c-8.828-15.31-3.594-34.88 11.72-43.72L159.1 256L41.72 187.7C26.41 178.9 21.17 159.3 29.1 144C36.63 132.5 49.26 126.7 61.65 128.2C65.78 128.7 69.88 130.1 73.72 132.3L192 200.6V64c0-17.67 14.33-32 32-32S256 46.33 256 64v136.6l118.3-68.29c3.838-2.213 7.939-3.539 12.07-4.051C398.7 126.7 411.4 132.5 417.1 144c8.828 15.31 3.594 34.88-11.72 43.72L288 256l118.3 68.28C421.6 333.1 426.8 352.7 417.1 368z"
        })
    }),
    flags: {
        outline: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M0 0l6.084 24H8L1.916 0zM21 5h-4l-1-4H4l3 12h3l1 4h13L21 5zM6.563 3h7.875l2 8H8.563l-2-8zm8.832 10l-2.856 1.904L12.063 13h3.332zM19 13l-1.5-6h1.938l2 8H16l3-2z"
            })
        }),
        solid: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M64 496C64 504.8 56.75 512 48 512h-32C7.25 512 0 504.8 0 496V32c0-17.75 14.25-32 32-32s32 14.25 32 32V496zM476.3 0c-6.365 0-13.01 1.35-19.34 4.233c-45.69 20.86-79.56 27.94-107.8 27.94c-59.96 0-94.81-31.86-163.9-31.87C160.9 .3055 131.6 4.867 96 15.75v350.5c32-9.984 59.87-14.1 84.85-14.1c73.63 0 124.9 31.78 198.6 31.78c31.91 0 68.02-5.971 111.1-23.09C504.1 355.9 512 344.4 512 332.1V30.73C512 11.1 495.3 0 476.3 0z"
            })
        })
    },
    foods: {
        outline: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M17 4.978c-1.838 0-2.876.396-3.68.934.513-1.172 1.768-2.934 4.68-2.934a1 1 0 0 0 0-2c-2.921 0-4.629 1.365-5.547 2.512-.064.078-.119.162-.18.244C11.73 1.838 10.798.023 9.207.023 8.579.022 7.85.306 7 .978 5.027 2.54 5.329 3.902 6.492 4.999 3.609 5.222 0 7.352 0 12.969c0 4.582 4.961 11.009 9 11.009 1.975 0 2.371-.486 3-1 .629.514 1.025 1 3 1 4.039 0 9-6.418 9-11 0-5.953-4.055-8-7-8M8.242 2.546c.641-.508.943-.523.965-.523.426.169.975 1.405 1.357 3.055-1.527-.629-2.741-1.352-2.98-1.846.059-.112.241-.356.658-.686M15 21.978c-1.08 0-1.21-.109-1.559-.402l-.176-.146c-.367-.302-.816-.452-1.266-.452s-.898.15-1.266.452l-.176.146c-.347.292-.477.402-1.557.402-2.813 0-7-5.389-7-9.009 0-5.823 4.488-5.991 5-5.991 1.939 0 2.484.471 3.387 1.251l.323.276a1.995 1.995 0 0 0 2.58 0l.323-.276c.902-.78 1.447-1.251 3.387-1.251.512 0 5 .168 5 6 0 3.617-4.187 9-7 9"
            })
        }),
        solid: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M481.9 270.1C490.9 279.1 496 291.3 496 304C496 316.7 490.9 328.9 481.9 337.9C472.9 346.9 460.7 352 448 352H64C51.27 352 39.06 346.9 30.06 337.9C21.06 328.9 16 316.7 16 304C16 291.3 21.06 279.1 30.06 270.1C39.06 261.1 51.27 256 64 256H448C460.7 256 472.9 261.1 481.9 270.1zM475.3 388.7C478.3 391.7 480 395.8 480 400V416C480 432.1 473.3 449.3 461.3 461.3C449.3 473.3 432.1 480 416 480H96C79.03 480 62.75 473.3 50.75 461.3C38.74 449.3 32 432.1 32 416V400C32 395.8 33.69 391.7 36.69 388.7C39.69 385.7 43.76 384 48 384H464C468.2 384 472.3 385.7 475.3 388.7zM50.39 220.8C45.93 218.6 42.03 215.5 38.97 211.6C35.91 207.7 33.79 203.2 32.75 198.4C31.71 193.5 31.8 188.5 32.99 183.7C54.98 97.02 146.5 32 256 32C365.5 32 457 97.02 479 183.7C480.2 188.5 480.3 193.5 479.2 198.4C478.2 203.2 476.1 207.7 473 211.6C469.1 215.5 466.1 218.6 461.6 220.8C457.2 222.9 452.3 224 447.3 224H64.67C59.73 224 54.84 222.9 50.39 220.8zM372.7 116.7C369.7 119.7 368 123.8 368 128C368 131.2 368.9 134.3 370.7 136.9C372.5 139.5 374.1 141.6 377.9 142.8C380.8 143.1 384 144.3 387.1 143.7C390.2 143.1 393.1 141.6 395.3 139.3C397.6 137.1 399.1 134.2 399.7 131.1C400.3 128 399.1 124.8 398.8 121.9C397.6 118.1 395.5 116.5 392.9 114.7C390.3 112.9 387.2 111.1 384 111.1C379.8 111.1 375.7 113.7 372.7 116.7V116.7zM244.7 84.69C241.7 87.69 240 91.76 240 96C240 99.16 240.9 102.3 242.7 104.9C244.5 107.5 246.1 109.6 249.9 110.8C252.8 111.1 256 112.3 259.1 111.7C262.2 111.1 265.1 109.6 267.3 107.3C269.6 105.1 271.1 102.2 271.7 99.12C272.3 96.02 271.1 92.8 270.8 89.88C269.6 86.95 267.5 84.45 264.9 82.7C262.3 80.94 259.2 79.1 256 79.1C251.8 79.1 247.7 81.69 244.7 84.69V84.69zM116.7 116.7C113.7 119.7 112 123.8 112 128C112 131.2 112.9 134.3 114.7 136.9C116.5 139.5 118.1 141.6 121.9 142.8C124.8 143.1 128 144.3 131.1 143.7C134.2 143.1 137.1 141.6 139.3 139.3C141.6 137.1 143.1 134.2 143.7 131.1C144.3 128 143.1 124.8 142.8 121.9C141.6 118.1 139.5 116.5 136.9 114.7C134.3 112.9 131.2 111.1 128 111.1C123.8 111.1 119.7 113.7 116.7 116.7L116.7 116.7z"
            })
        })
    },
    frequent: {
        outline: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: [
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                    d: "M13 4h-2l-.001 7H9v2h2v2h2v-2h4v-2h-4z"
                }),
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                    d: "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0m0 22C6.486 22 2 17.514 2 12S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10"
                })
            ]
        }),
        solid: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M256 512C114.6 512 0 397.4 0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 397.4 397.4 512 256 512zM232 256C232 264 236 271.5 242.7 275.1L338.7 339.1C349.7 347.3 364.6 344.3 371.1 333.3C379.3 322.3 376.3 307.4 365.3 300L280 243.2V120C280 106.7 269.3 96 255.1 96C242.7 96 231.1 106.7 231.1 120L232 256z"
            })
        })
    },
    nature: {
        outline: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: [
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                    d: "M15.5 8a1.5 1.5 0 1 0 .001 3.001A1.5 1.5 0 0 0 15.5 8M8.5 8a1.5 1.5 0 1 0 .001 3.001A1.5 1.5 0 0 0 8.5 8"
                }),
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                    d: "M18.933 0h-.027c-.97 0-2.138.787-3.018 1.497-1.274-.374-2.612-.51-3.887-.51-1.285 0-2.616.133-3.874.517C7.245.79 6.069 0 5.093 0h-.027C3.352 0 .07 2.67.002 7.026c-.039 2.479.276 4.238 1.04 5.013.254.258.882.677 1.295.882.191 3.177.922 5.238 2.536 6.38.897.637 2.187.949 3.2 1.102C8.04 20.6 8 20.795 8 21c0 1.773 2.35 3 4 3 1.648 0 4-1.227 4-3 0-.201-.038-.393-.072-.586 2.573-.385 5.435-1.877 5.925-7.587.396-.22.887-.568 1.104-.788.763-.774 1.079-2.534 1.04-5.013C23.929 2.67 20.646 0 18.933 0M3.223 9.135c-.237.281-.837 1.155-.884 1.238-.15-.41-.368-1.349-.337-3.291.051-3.281 2.478-4.972 3.091-5.031.256.015.731.27 1.265.646-1.11 1.171-2.275 2.915-2.352 5.125-.133.546-.398.858-.783 1.313M12 22c-.901 0-1.954-.693-2-1 0-.654.475-1.236 1-1.602V20a1 1 0 1 0 2 0v-.602c.524.365 1 .947 1 1.602-.046.307-1.099 1-2 1m3-3.48v.02a4.752 4.752 0 0 0-1.262-1.02c1.092-.516 2.239-1.334 2.239-2.217 0-1.842-1.781-2.195-3.977-2.195-2.196 0-3.978.354-3.978 2.195 0 .883 1.148 1.701 2.238 2.217A4.8 4.8 0 0 0 9 18.539v-.025c-1-.076-2.182-.281-2.973-.842-1.301-.92-1.838-3.045-1.853-6.478l.023-.041c.496-.826 1.49-1.45 1.804-3.102 0-2.047 1.357-3.631 2.362-4.522C9.37 3.178 10.555 3 11.948 3c1.447 0 2.685.192 3.733.57 1 .9 2.316 2.465 2.316 4.48.313 1.651 1.307 2.275 1.803 3.102.035.058.068.117.102.178-.059 5.967-1.949 7.01-4.902 7.19m6.628-8.202c-.037-.065-.074-.13-.113-.195a7.587 7.587 0 0 0-.739-.987c-.385-.455-.648-.768-.782-1.313-.076-2.209-1.241-3.954-2.353-5.124.531-.376 1.004-.63 1.261-.647.636.071 3.044 1.764 3.096 5.031.027 1.81-.347 3.218-.37 3.235"
                })
            ]
        }),
        solid: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 576 512",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M332.7 19.85C334.6 8.395 344.5 0 356.1 0C363.6 0 370.6 3.52 375.1 9.502L392 32H444.1C456.8 32 469.1 37.06 478.1 46.06L496 64H552C565.3 64 576 74.75 576 88V112C576 156.2 540.2 192 496 192H426.7L421.6 222.5L309.6 158.5L332.7 19.85zM448 64C439.2 64 432 71.16 432 80C432 88.84 439.2 96 448 96C456.8 96 464 88.84 464 80C464 71.16 456.8 64 448 64zM416 256.1V480C416 497.7 401.7 512 384 512H352C334.3 512 320 497.7 320 480V364.8C295.1 377.1 268.8 384 240 384C211.2 384 184 377.1 160 364.8V480C160 497.7 145.7 512 128 512H96C78.33 512 64 497.7 64 480V249.8C35.23 238.9 12.64 214.5 4.836 183.3L.9558 167.8C-3.331 150.6 7.094 133.2 24.24 128.1C41.38 124.7 58.76 135.1 63.05 152.2L66.93 167.8C70.49 182 83.29 191.1 97.97 191.1H303.8L416 256.1z"
            })
        })
    },
    objects: {
        outline: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: [
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                    d: "M12 0a9 9 0 0 0-5 16.482V21s2.035 3 5 3 5-3 5-3v-4.518A9 9 0 0 0 12 0zm0 2c3.86 0 7 3.141 7 7s-3.14 7-7 7-7-3.141-7-7 3.14-7 7-7zM9 17.477c.94.332 1.946.523 3 .523s2.06-.19 3-.523v.834c-.91.436-1.925.689-3 .689a6.924 6.924 0 0 1-3-.69v-.833zm.236 3.07A8.854 8.854 0 0 0 12 21c.965 0 1.888-.167 2.758-.451C14.155 21.173 13.153 22 12 22c-1.102 0-2.117-.789-2.764-1.453z"
                }),
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                    d: "M14.745 12.449h-.004c-.852-.024-1.188-.858-1.577-1.824-.421-1.061-.703-1.561-1.182-1.566h-.009c-.481 0-.783.497-1.235 1.537-.436.982-.801 1.811-1.636 1.791l-.276-.043c-.565-.171-.853-.691-1.284-1.794-.125-.313-.202-.632-.27-.913-.051-.213-.127-.53-.195-.634C7.067 9.004 7.039 9 6.99 9A1 1 0 0 1 7 7h.01c1.662.017 2.015 1.373 2.198 2.134.486-.981 1.304-2.058 2.797-2.075 1.531.018 2.28 1.153 2.731 2.141l.002-.008C14.944 8.424 15.327 7 16.979 7h.032A1 1 0 1 1 17 9h-.011c-.149.076-.256.474-.319.709a6.484 6.484 0 0 1-.311.951c-.429.973-.79 1.789-1.614 1.789"
                })
            ]
        }),
        solid: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 384 512",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M112.1 454.3c0 6.297 1.816 12.44 5.284 17.69l17.14 25.69c5.25 7.875 17.17 14.28 26.64 14.28h61.67c9.438 0 21.36-6.401 26.61-14.28l17.08-25.68c2.938-4.438 5.348-12.37 5.348-17.7L272 415.1h-160L112.1 454.3zM191.4 .0132C89.44 .3257 16 82.97 16 175.1c0 44.38 16.44 84.84 43.56 115.8c16.53 18.84 42.34 58.23 52.22 91.45c.0313 .25 .0938 .5166 .125 .7823h160.2c.0313-.2656 .0938-.5166 .125-.7823c9.875-33.22 35.69-72.61 52.22-91.45C351.6 260.8 368 220.4 368 175.1C368 78.61 288.9-.2837 191.4 .0132zM192 96.01c-44.13 0-80 35.89-80 79.1C112 184.8 104.8 192 96 192S80 184.8 80 176c0-61.76 50.25-111.1 112-111.1c8.844 0 16 7.159 16 16S200.8 96.01 192 96.01z"
            })
        })
    },
    people: {
        outline: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: [
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                    d: "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0m0 22C6.486 22 2 17.514 2 12S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10"
                }),
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                    d: "M8 7a2 2 0 1 0-.001 3.999A2 2 0 0 0 8 7M16 7a2 2 0 1 0-.001 3.999A2 2 0 0 0 16 7M15.232 15c-.693 1.195-1.87 2-3.349 2-1.477 0-2.655-.805-3.347-2H15m3-2H6a6 6 0 1 0 12 0"
                })
            ]
        }),
        solid: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256zM256 432C332.1 432 396.2 382 415.2 314.1C419.1 300.4 407.8 288 393.6 288H118.4C104.2 288 92.92 300.4 96.76 314.1C115.8 382 179.9 432 256 432V432zM176.4 160C158.7 160 144.4 174.3 144.4 192C144.4 209.7 158.7 224 176.4 224C194 224 208.4 209.7 208.4 192C208.4 174.3 194 160 176.4 160zM336.4 224C354 224 368.4 209.7 368.4 192C368.4 174.3 354 160 336.4 160C318.7 160 304.4 174.3 304.4 192C304.4 209.7 318.7 224 336.4 224z"
            })
        })
    },
    places: {
        outline: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: [
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                    d: "M6.5 12C5.122 12 4 13.121 4 14.5S5.122 17 6.5 17 9 15.879 9 14.5 7.878 12 6.5 12m0 3c-.275 0-.5-.225-.5-.5s.225-.5.5-.5.5.225.5.5-.225.5-.5.5M17.5 12c-1.378 0-2.5 1.121-2.5 2.5s1.122 2.5 2.5 2.5 2.5-1.121 2.5-2.5-1.122-2.5-2.5-2.5m0 3c-.275 0-.5-.225-.5-.5s.225-.5.5-.5.5.225.5.5-.225.5-.5.5"
                }),
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                    d: "M22.482 9.494l-1.039-.346L21.4 9h.6c.552 0 1-.439 1-.992 0-.006-.003-.008-.003-.008H23c0-1-.889-2-1.984-2h-.642l-.731-1.717C19.262 3.012 18.091 2 16.764 2H7.236C5.909 2 4.738 3.012 4.357 4.283L3.626 6h-.642C1.889 6 1 7 1 8h.003S1 8.002 1 8.008C1 8.561 1.448 9 2 9h.6l-.043.148-1.039.346a2.001 2.001 0 0 0-1.359 2.097l.751 7.508a1 1 0 0 0 .994.901H3v1c0 1.103.896 2 2 2h2c1.104 0 2-.897 2-2v-1h6v1c0 1.103.896 2 2 2h2c1.104 0 2-.897 2-2v-1h1.096a.999.999 0 0 0 .994-.901l.751-7.508a2.001 2.001 0 0 0-1.359-2.097M6.273 4.857C6.402 4.43 6.788 4 7.236 4h9.527c.448 0 .834.43.963.857L19.313 9H4.688l1.585-4.143zM7 21H5v-1h2v1zm12 0h-2v-1h2v1zm2.189-3H2.811l-.662-6.607L3 11h18l.852.393L21.189 18z"
                })
            ]
        }),
        solid: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M39.61 196.8L74.8 96.29C88.27 57.78 124.6 32 165.4 32H346.6C387.4 32 423.7 57.78 437.2 96.29L472.4 196.8C495.6 206.4 512 229.3 512 256V448C512 465.7 497.7 480 480 480H448C430.3 480 416 465.7 416 448V400H96V448C96 465.7 81.67 480 64 480H32C14.33 480 0 465.7 0 448V256C0 229.3 16.36 206.4 39.61 196.8V196.8zM109.1 192H402.9L376.8 117.4C372.3 104.6 360.2 96 346.6 96H165.4C151.8 96 139.7 104.6 135.2 117.4L109.1 192zM96 256C78.33 256 64 270.3 64 288C64 305.7 78.33 320 96 320C113.7 320 128 305.7 128 288C128 270.3 113.7 256 96 256zM416 320C433.7 320 448 305.7 448 288C448 270.3 433.7 256 416 256C398.3 256 384 270.3 384 288C384 305.7 398.3 320 416 320z"
            })
        })
    },
    symbols: {
        outline: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M0 0h11v2H0zM4 11h3V6h4V4H0v2h4zM15.5 17c1.381 0 2.5-1.116 2.5-2.493s-1.119-2.493-2.5-2.493S13 13.13 13 14.507 14.119 17 15.5 17m0-2.986c.276 0 .5.222.5.493 0 .272-.224.493-.5.493s-.5-.221-.5-.493.224-.493.5-.493M21.5 19.014c-1.381 0-2.5 1.116-2.5 2.493S20.119 24 21.5 24s2.5-1.116 2.5-2.493-1.119-2.493-2.5-2.493m0 2.986a.497.497 0 0 1-.5-.493c0-.271.224-.493.5-.493s.5.222.5.493a.497.497 0 0 1-.5.493M22 13l-9 9 1.513 1.5 8.99-9.009zM17 11c2.209 0 4-1.119 4-2.5V2s.985-.161 1.498.949C23.01 4.055 23 6 23 6s1-1.119 1-3.135C24-.02 21 0 21 0h-2v6.347A5.853 5.853 0 0 0 17 6c-2.209 0-4 1.119-4 2.5s1.791 2.5 4 2.5M10.297 20.482l-1.475-1.585a47.54 47.54 0 0 1-1.442 1.129c-.307-.288-.989-1.016-2.045-2.183.902-.836 1.479-1.466 1.729-1.892s.376-.871.376-1.336c0-.592-.273-1.178-.818-1.759-.546-.581-1.329-.871-2.349-.871-1.008 0-1.79.293-2.344.879-.556.587-.832 1.181-.832 1.784 0 .813.419 1.748 1.256 2.805-.847.614-1.444 1.208-1.794 1.784a3.465 3.465 0 0 0-.523 1.833c0 .857.308 1.56.924 2.107.616.549 1.423.823 2.42.823 1.173 0 2.444-.379 3.813-1.137L8.235 24h2.819l-2.09-2.383 1.333-1.135zm-6.736-6.389a1.02 1.02 0 0 1 .73-.286c.31 0 .559.085.747.254a.849.849 0 0 1 .283.659c0 .518-.419 1.112-1.257 1.784-.536-.651-.805-1.231-.805-1.742a.901.901 0 0 1 .302-.669M3.74 22c-.427 0-.778-.116-1.057-.349-.279-.232-.418-.487-.418-.766 0-.594.509-1.288 1.527-2.083.968 1.134 1.717 1.946 2.248 2.438-.921.507-1.686.76-2.3.76"
            })
        }),
        solid: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
                d: "M500.3 7.251C507.7 13.33 512 22.41 512 31.1V175.1C512 202.5 483.3 223.1 447.1 223.1C412.7 223.1 383.1 202.5 383.1 175.1C383.1 149.5 412.7 127.1 447.1 127.1V71.03L351.1 90.23V207.1C351.1 234.5 323.3 255.1 287.1 255.1C252.7 255.1 223.1 234.5 223.1 207.1C223.1 181.5 252.7 159.1 287.1 159.1V63.1C287.1 48.74 298.8 35.61 313.7 32.62L473.7 .6198C483.1-1.261 492.9 1.173 500.3 7.251H500.3zM74.66 303.1L86.5 286.2C92.43 277.3 102.4 271.1 113.1 271.1H174.9C185.6 271.1 195.6 277.3 201.5 286.2L213.3 303.1H239.1C266.5 303.1 287.1 325.5 287.1 351.1V463.1C287.1 490.5 266.5 511.1 239.1 511.1H47.1C21.49 511.1-.0019 490.5-.0019 463.1V351.1C-.0019 325.5 21.49 303.1 47.1 303.1H74.66zM143.1 359.1C117.5 359.1 95.1 381.5 95.1 407.1C95.1 434.5 117.5 455.1 143.1 455.1C170.5 455.1 191.1 434.5 191.1 407.1C191.1 381.5 170.5 359.1 143.1 359.1zM440.3 367.1H496C502.7 367.1 508.6 372.1 510.1 378.4C513.3 384.6 511.6 391.7 506.5 396L378.5 508C372.9 512.1 364.6 513.3 358.6 508.9C352.6 504.6 350.3 496.6 353.3 489.7L391.7 399.1H336C329.3 399.1 323.4 395.9 321 389.6C318.7 383.4 320.4 376.3 325.5 371.1L453.5 259.1C459.1 255 467.4 254.7 473.4 259.1C479.4 263.4 481.6 271.4 478.7 278.3L440.3 367.1zM116.7 219.1L19.85 119.2C-8.112 90.26-6.614 42.31 24.85 15.34C51.82-8.137 93.26-3.642 118.2 21.83L128.2 32.32L137.7 21.83C162.7-3.642 203.6-8.137 231.6 15.34C262.6 42.31 264.1 90.26 236.1 119.2L139.7 219.1C133.2 225.6 122.7 225.6 116.7 219.1H116.7z"
            })
        })
    }
};
const $fcccfb36ed0cde68$var$search = {
    loupe: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 20 20",
        children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
            d: "M12.9 14.32a8 8 0 1 1 1.41-1.41l5.35 5.33-1.42 1.42-5.33-5.34zM8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12z"
        })
    }),
    delete: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 20 20",
        children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("path", {
            d: "M10 8.586L2.929 1.515 1.515 2.929 8.586 10l-7.071 7.071 1.414 1.414L10 11.414l7.071 7.071 1.414-1.414L11.414 10l7.071-7.071-1.414-1.414L10 8.586z"
        })
    })
};
var $fcccfb36ed0cde68$export$2e2bcd8739ae039 = {
    categories: $fcccfb36ed0cde68$var$categories,
    search: $fcccfb36ed0cde68$var$search
};





function $254755d3f438722f$export$2e2bcd8739ae039(props) {
    let { id: id , skin: skin , emoji: emoji  } = props;
    if (props.shortcodes) {
        const matches = props.shortcodes.match((0, $c4d155af13ad4d4b$export$2e2bcd8739ae039).SHORTCODES_REGEX);
        if (matches) {
            id = matches[1];
            if (matches[2]) skin = matches[2];
        }
    }
    emoji || (emoji = (0, $c4d155af13ad4d4b$export$2e2bcd8739ae039).get(id || props.native));
    if (!emoji) return props.fallback;
    const emojiSkin = emoji.skins[skin - 1] || emoji.skins[0];
    const imageSrc = emojiSkin.src || (props.set != "native" && !props.spritesheet ? typeof props.getImageURL === "function" ? props.getImageURL(props.set, emojiSkin.unified) : `https://cdn.jsdelivr.net/npm/emoji-datasource-${props.set}@15.0.1/img/${props.set}/64/${emojiSkin.unified}.png` : undefined);
    const spritesheetSrc = typeof props.getSpritesheetURL === "function" ? props.getSpritesheetURL(props.set) : `https://cdn.jsdelivr.net/npm/emoji-datasource-${props.set}@15.0.1/img/${props.set}/sheets-256/64.png`;
    return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("span", {
        class: "emoji-mart-emoji",
        "data-emoji-set": props.set,
        children: imageSrc ? /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("img", {
            style: {
                maxWidth: props.size || "1em",
                maxHeight: props.size || "1em",
                display: "inline-block"
            },
            alt: emojiSkin.native || emojiSkin.shortcodes,
            src: imageSrc
        }) : props.set == "native" ? /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("span", {
            style: {
                fontSize: props.size,
                fontFamily: '"EmojiMart", "Segoe UI Emoji", "Segoe UI Symbol", "Segoe UI", "Apple Color Emoji", "Twemoji Mozilla", "Noto Color Emoji", "Android Emoji"'
            },
            children: emojiSkin.native
        }) : /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("span", {
            style: {
                display: "block",
                width: props.size,
                height: props.size,
                backgroundImage: `url(${spritesheetSrc})`,
                backgroundSize: `${100 * (0, $7adb23b0109cc36a$export$2d0294657ab35f1b).sheet.cols}% ${100 * (0, $7adb23b0109cc36a$export$2d0294657ab35f1b).sheet.rows}%`,
                backgroundPosition: `${100 / ((0, $7adb23b0109cc36a$export$2d0294657ab35f1b).sheet.cols - 1) * emojiSkin.x}% ${100 / ((0, $7adb23b0109cc36a$export$2d0294657ab35f1b).sheet.rows - 1) * emojiSkin.y}%`
            }
        })
    });
}







const $6f57cc9cd54c5aaa$var$WindowHTMLElement = typeof window !== "undefined" && window.HTMLElement ? window.HTMLElement : Object;
class $6f57cc9cd54c5aaa$export$2e2bcd8739ae039 extends $6f57cc9cd54c5aaa$var$WindowHTMLElement {
    static get observedAttributes() {
        return Object.keys(this.Props);
    }
    update(props = {}) {
        for(let k in props)this.attributeChangedCallback(k, null, props[k]);
    }
    attributeChangedCallback(attr, _, newValue) {
        if (!this.component) return;
        const value = (0, $7adb23b0109cc36a$export$88c9ddb45cea7241)(attr, {
            [attr]: newValue
        }, this.constructor.Props, this);
        if (this.component.componentWillReceiveProps) this.component.componentWillReceiveProps({
            [attr]: value
        });
        else {
            this.component.props[attr] = value;
            this.component.forceUpdate();
        }
    }
    disconnectedCallback() {
        this.disconnected = true;
        if (this.component && this.component.unregister) this.component.unregister();
    }
    constructor(props = {}){
        super();
        this.props = props;
        if (props.parent || props.ref) {
            let ref = null;
            const parent = props.parent || (ref = props.ref && props.ref.current);
            if (ref) ref.innerHTML = "";
            if (parent) parent.appendChild(this);
        }
    }
}



class $26f27c338a96b1a6$export$2e2bcd8739ae039 extends (0, $6f57cc9cd54c5aaa$export$2e2bcd8739ae039) {
    setShadow() {
        this.attachShadow({
            mode: "open"
        });
    }
    injectStyles(styles) {
        if (!styles) return;
        const style = document.createElement("style");
        style.textContent = styles;
        this.shadowRoot.insertBefore(style, this.shadowRoot.firstChild);
    }
    constructor(props, { styles: styles  } = {}){
        super(props);
        this.setShadow();
        this.injectStyles(styles);
    }
}






var $3d90f6e46fb2dd47$export$2e2bcd8739ae039 = {
    fallback: "",
    id: "",
    native: "",
    shortcodes: "",
    size: {
        value: "",
        transform: (value)=>{
            // If the value is a number, then we assume it’s a pixel value.
            if (!/\D/.test(value)) return `${value}px`;
            return value;
        }
    },
    // Shared
    set: (0, $b247ea80b67298d5$export$2e2bcd8739ae039).set,
    skin: (0, $b247ea80b67298d5$export$2e2bcd8739ae039).skin
};


class $331b4160623139bf$export$2e2bcd8739ae039 extends (0, $6f57cc9cd54c5aaa$export$2e2bcd8739ae039) {
    async connectedCallback() {
        const props = (0, $7adb23b0109cc36a$export$75fe5f91d452f94b)(this.props, (0, $3d90f6e46fb2dd47$export$2e2bcd8739ae039), this);
        props.element = this;
        props.ref = (component)=>{
            this.component = component;
        };
        await (0, $7adb23b0109cc36a$export$2cd8252107eb640b)();
        if (this.disconnected) return;
        (0, $fb96b826c0c5f37a$export$b3890eb0ae9dca99)(/*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)((0, $254755d3f438722f$export$2e2bcd8739ae039), {
            ...props
        }), this);
    }
    constructor(props){
        super(props);
    }
}
(0, $c770c458706daa72$export$2e2bcd8739ae039)($331b4160623139bf$export$2e2bcd8739ae039, "Props", (0, $3d90f6e46fb2dd47$export$2e2bcd8739ae039));
if (typeof customElements !== "undefined" && !customElements.get("em-emoji")) customElements.define("em-emoji", $331b4160623139bf$export$2e2bcd8739ae039);






var $1a9a8ef576b7773d$var$t, $1a9a8ef576b7773d$var$u, $1a9a8ef576b7773d$var$r, $1a9a8ef576b7773d$var$o = 0, $1a9a8ef576b7773d$var$i = [], $1a9a8ef576b7773d$var$c = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__b, $1a9a8ef576b7773d$var$f = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__r, $1a9a8ef576b7773d$var$e = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).diffed, $1a9a8ef576b7773d$var$a = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__c, $1a9a8ef576b7773d$var$v = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).unmount;
function $1a9a8ef576b7773d$var$m(t1, r1) {
    (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__h && (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__h($1a9a8ef576b7773d$var$u, t1, $1a9a8ef576b7773d$var$o || r1), $1a9a8ef576b7773d$var$o = 0;
    var i1 = $1a9a8ef576b7773d$var$u.__H || ($1a9a8ef576b7773d$var$u.__H = {
        __: [],
        __h: []
    });
    return t1 >= i1.__.length && i1.__.push({}), i1.__[t1];
}
function $1a9a8ef576b7773d$export$60241385465d0a34(n1) {
    return $1a9a8ef576b7773d$var$o = 1, $1a9a8ef576b7773d$export$13e3392192263954($1a9a8ef576b7773d$var$w, n1);
}
function $1a9a8ef576b7773d$export$13e3392192263954(n2, r2, o1) {
    var i2 = $1a9a8ef576b7773d$var$m($1a9a8ef576b7773d$var$t++, 2);
    return i2.t = n2, i2.__c || (i2.__ = [
        o1 ? o1(r2) : $1a9a8ef576b7773d$var$w(void 0, r2),
        function(n3) {
            var t2 = i2.t(i2.__[0], n3);
            i2.__[0] !== t2 && (i2.__ = [
                t2,
                i2.__[1]
            ], i2.__c.setState({}));
        }
    ], i2.__c = $1a9a8ef576b7773d$var$u), i2.__;
}
function $1a9a8ef576b7773d$export$6d9c69b0de29b591(r3, o2) {
    var i3 = $1a9a8ef576b7773d$var$m($1a9a8ef576b7773d$var$t++, 3);
    !(0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__s && $1a9a8ef576b7773d$var$k(i3.__H, o2) && (i3.__ = r3, i3.__H = o2, $1a9a8ef576b7773d$var$u.__H.__h.push(i3));
}
function $1a9a8ef576b7773d$export$e5c5a5f917a5871c(r4, o3) {
    var i4 = $1a9a8ef576b7773d$var$m($1a9a8ef576b7773d$var$t++, 4);
    !(0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__s && $1a9a8ef576b7773d$var$k(i4.__H, o3) && (i4.__ = r4, i4.__H = o3, $1a9a8ef576b7773d$var$u.__h.push(i4));
}
function $1a9a8ef576b7773d$export$b8f5890fc79d6aca(n4) {
    return $1a9a8ef576b7773d$var$o = 5, $1a9a8ef576b7773d$export$1538c33de8887b59(function() {
        return {
            current: n4
        };
    }, []);
}
function $1a9a8ef576b7773d$export$d5a552a76deda3c2(n5, t3, u1) {
    $1a9a8ef576b7773d$var$o = 6, $1a9a8ef576b7773d$export$e5c5a5f917a5871c(function() {
        "function" == typeof n5 ? n5(t3()) : n5 && (n5.current = t3());
    }, null == u1 ? u1 : u1.concat(n5));
}
function $1a9a8ef576b7773d$export$1538c33de8887b59(n6, u2) {
    var r5 = $1a9a8ef576b7773d$var$m($1a9a8ef576b7773d$var$t++, 7);
    return $1a9a8ef576b7773d$var$k(r5.__H, u2) && (r5.__ = n6(), r5.__H = u2, r5.__h = n6), r5.__;
}
function $1a9a8ef576b7773d$export$35808ee640e87ca7(n7, t4) {
    return $1a9a8ef576b7773d$var$o = 8, $1a9a8ef576b7773d$export$1538c33de8887b59(function() {
        return n7;
    }, t4);
}
function $1a9a8ef576b7773d$export$fae74005e78b1a27(n8) {
    var r6 = $1a9a8ef576b7773d$var$u.context[n8.__c], o4 = $1a9a8ef576b7773d$var$m($1a9a8ef576b7773d$var$t++, 9);
    return o4.c = n8, r6 ? (null == o4.__ && (o4.__ = !0, r6.sub($1a9a8ef576b7773d$var$u)), r6.props.value) : n8.__;
}
function $1a9a8ef576b7773d$export$dc8fbce3eb94dc1e(t5, u3) {
    (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).useDebugValue && (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).useDebugValue(u3 ? u3(t5) : t5);
}
function $1a9a8ef576b7773d$export$c052f6604b7d51fe(n9) {
    var r7 = $1a9a8ef576b7773d$var$m($1a9a8ef576b7773d$var$t++, 10), o5 = $1a9a8ef576b7773d$export$60241385465d0a34();
    return r7.__ = n9, $1a9a8ef576b7773d$var$u.componentDidCatch || ($1a9a8ef576b7773d$var$u.componentDidCatch = function(n10) {
        r7.__ && r7.__(n10), o5[1](n10);
    }), [
        o5[0],
        function() {
            o5[1](void 0);
        }
    ];
}
function $1a9a8ef576b7773d$var$x() {
    var t6;
    for($1a9a8ef576b7773d$var$i.sort(function(n11, t7) {
        return n11.__v.__b - t7.__v.__b;
    }); t6 = $1a9a8ef576b7773d$var$i.pop();)if (t6.__P) try {
        t6.__H.__h.forEach($1a9a8ef576b7773d$var$g), t6.__H.__h.forEach($1a9a8ef576b7773d$var$j), t6.__H.__h = [];
    } catch (u4) {
        t6.__H.__h = [], (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__e(u4, t6.__v);
    }
}
(0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__b = function(n12) {
    $1a9a8ef576b7773d$var$u = null, $1a9a8ef576b7773d$var$c && $1a9a8ef576b7773d$var$c(n12);
}, (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__r = function(n13) {
    $1a9a8ef576b7773d$var$f && $1a9a8ef576b7773d$var$f(n13), $1a9a8ef576b7773d$var$t = 0;
    var r8 = ($1a9a8ef576b7773d$var$u = n13.__c).__H;
    r8 && (r8.__h.forEach($1a9a8ef576b7773d$var$g), r8.__h.forEach($1a9a8ef576b7773d$var$j), r8.__h = []);
}, (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).diffed = function(t8) {
    $1a9a8ef576b7773d$var$e && $1a9a8ef576b7773d$var$e(t8);
    var o6 = t8.__c;
    o6 && o6.__H && o6.__H.__h.length && (1 !== $1a9a8ef576b7773d$var$i.push(o6) && $1a9a8ef576b7773d$var$r === (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).requestAnimationFrame || (($1a9a8ef576b7773d$var$r = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).requestAnimationFrame) || function(n14) {
        var t9, u5 = function() {
            clearTimeout(r9), $1a9a8ef576b7773d$var$b && cancelAnimationFrame(t9), setTimeout(n14);
        }, r9 = setTimeout(u5, 100);
        $1a9a8ef576b7773d$var$b && (t9 = requestAnimationFrame(u5));
    })($1a9a8ef576b7773d$var$x)), $1a9a8ef576b7773d$var$u = null;
}, (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__c = function(t10, u6) {
    u6.some(function(t11) {
        try {
            t11.__h.forEach($1a9a8ef576b7773d$var$g), t11.__h = t11.__h.filter(function(n15) {
                return !n15.__ || $1a9a8ef576b7773d$var$j(n15);
            });
        } catch (r10) {
            u6.some(function(n16) {
                n16.__h && (n16.__h = []);
            }), u6 = [], (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__e(r10, t11.__v);
        }
    }), $1a9a8ef576b7773d$var$a && $1a9a8ef576b7773d$var$a(t10, u6);
}, (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).unmount = function(t12) {
    $1a9a8ef576b7773d$var$v && $1a9a8ef576b7773d$var$v(t12);
    var u7, r11 = t12.__c;
    r11 && r11.__H && (r11.__H.__.forEach(function(n17) {
        try {
            $1a9a8ef576b7773d$var$g(n17);
        } catch (n18) {
            u7 = n18;
        }
    }), u7 && (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__e(u7, r11.__v));
};
var $1a9a8ef576b7773d$var$b = "function" == typeof requestAnimationFrame;
function $1a9a8ef576b7773d$var$g(n19) {
    var t13 = $1a9a8ef576b7773d$var$u, r12 = n19.__c;
    "function" == typeof r12 && (n19.__c = void 0, r12()), $1a9a8ef576b7773d$var$u = t13;
}
function $1a9a8ef576b7773d$var$j(n20) {
    var t14 = $1a9a8ef576b7773d$var$u;
    n20.__c = n20.__(), $1a9a8ef576b7773d$var$u = t14;
}
function $1a9a8ef576b7773d$var$k(n21, t15) {
    return !n21 || n21.length !== t15.length || t15.some(function(t16, u8) {
        return t16 !== n21[u8];
    });
}
function $1a9a8ef576b7773d$var$w(n22, t17) {
    return "function" == typeof t17 ? t17(n22) : t17;
}





function $dc040a17866866fa$var$S(n1, t1) {
    for(var e1 in t1)n1[e1] = t1[e1];
    return n1;
}
function $dc040a17866866fa$var$C(n2, t2) {
    for(var e2 in n2)if ("__source" !== e2 && !(e2 in t2)) return !0;
    for(var r1 in t2)if ("__source" !== r1 && n2[r1] !== t2[r1]) return !0;
    return !1;
}
function $dc040a17866866fa$export$221d75b3f55bb0bd(n3) {
    this.props = n3;
}
function $dc040a17866866fa$export$7c73462e0d25e514(n4, t3) {
    function e3(n5) {
        var e4 = this.props.ref, r3 = e4 == n5.ref;
        return !r3 && e4 && (e4.call ? e4(null) : e4.current = null), t3 ? !t3(this.props, n5) || !r3 : $dc040a17866866fa$var$C(this.props, n5);
    }
    function r2(t4) {
        return this.shouldComponentUpdate = e3, (0, $fb96b826c0c5f37a$export$c8a8987d4410bf2d)(n4, t4);
    }
    return r2.displayName = "Memo(" + (n4.displayName || n4.name) + ")", r2.prototype.isReactComponent = !0, r2.__f = !0, r2;
}
($dc040a17866866fa$export$221d75b3f55bb0bd.prototype = new (0, $fb96b826c0c5f37a$export$16fa2f45be04daa8)).isPureReactComponent = !0, $dc040a17866866fa$export$221d75b3f55bb0bd.prototype.shouldComponentUpdate = function(n6, t5) {
    return $dc040a17866866fa$var$C(this.props, n6) || $dc040a17866866fa$var$C(this.state, t5);
};
var $dc040a17866866fa$var$w = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__b;
(0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__b = function(n7) {
    n7.type && n7.type.__f && n7.ref && (n7.props.ref = n7.ref, n7.ref = null), $dc040a17866866fa$var$w && $dc040a17866866fa$var$w(n7);
};
var $dc040a17866866fa$var$R = "undefined" != typeof Symbol && Symbol.for && Symbol.for("react.forward_ref") || 3911;
function $dc040a17866866fa$export$257a8862b851cb5b(n8) {
    function t6(t7, e5) {
        var r4 = $dc040a17866866fa$var$S({}, t7);
        return delete r4.ref, n8(r4, (e5 = t7.ref || e5) && ("object" != typeof e5 || "current" in e5) ? e5 : null);
    }
    return t6.$$typeof = $dc040a17866866fa$var$R, t6.render = t6, t6.prototype.isReactComponent = t6.__f = !0, t6.displayName = "ForwardRef(" + (n8.displayName || n8.name) + ")", t6;
}
var $dc040a17866866fa$var$N = function(n9, t8) {
    return null == n9 ? null : (0, $fb96b826c0c5f37a$export$47e4c5b300681277)((0, $fb96b826c0c5f37a$export$47e4c5b300681277)(n9).map(t8));
}, $dc040a17866866fa$export$dca3b0875bd9a954 = {
    map: $dc040a17866866fa$var$N,
    forEach: $dc040a17866866fa$var$N,
    count: function(n10) {
        return n10 ? (0, $fb96b826c0c5f37a$export$47e4c5b300681277)(n10).length : 0;
    },
    only: function(n11) {
        var t9 = (0, $fb96b826c0c5f37a$export$47e4c5b300681277)(n11);
        if (1 !== t9.length) throw "Children.only";
        return t9[0];
    },
    toArray: (0, $fb96b826c0c5f37a$export$47e4c5b300681277)
}, $dc040a17866866fa$var$A = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__e;
(0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__e = function(n12, t10, e6) {
    if (n12.then) {
        for(var r5, u1 = t10; u1 = u1.__;)if ((r5 = u1.__c) && r5.__c) return null == t10.__e && (t10.__e = e6.__e, t10.__k = e6.__k), r5.__c(n12, t10);
    }
    $dc040a17866866fa$var$A(n12, t10, e6);
};
var $dc040a17866866fa$var$O = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).unmount;
function $dc040a17866866fa$export$74bf444e3cd11ea5() {
    this.__u = 0, this.t = null, this.__b = null;
}
function $dc040a17866866fa$var$U(n13) {
    var t11 = n13.__.__c;
    return t11 && t11.__e && t11.__e(n13);
}
function $dc040a17866866fa$export$488013bae63b21da(n14) {
    var t12, e7, r6;
    function u2(u3) {
        if (t12 || (t12 = n14()).then(function(n15) {
            e7 = n15.default || n15;
        }, function(n16) {
            r6 = n16;
        }), r6) throw r6;
        if (!e7) throw t12;
        return (0, $fb96b826c0c5f37a$export$c8a8987d4410bf2d)(e7, u3);
    }
    return u2.displayName = "Lazy", u2.__f = !0, u2;
}
function $dc040a17866866fa$export$998bcd577473dd93() {
    this.u = null, this.o = null;
}
(0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).unmount = function(n17) {
    var t13 = n17.__c;
    t13 && t13.__R && t13.__R(), t13 && !0 === n17.__h && (n17.type = null), $dc040a17866866fa$var$O && $dc040a17866866fa$var$O(n17);
}, ($dc040a17866866fa$export$74bf444e3cd11ea5.prototype = new (0, $fb96b826c0c5f37a$export$16fa2f45be04daa8)).__c = function(n18, t14) {
    var e8 = t14.__c, r7 = this;
    null == r7.t && (r7.t = []), r7.t.push(e8);
    var u4 = $dc040a17866866fa$var$U(r7.__v), o1 = !1, i1 = function() {
        o1 || (o1 = !0, e8.__R = null, u4 ? u4(l1) : l1());
    };
    e8.__R = i1;
    var l1 = function() {
        if (!--r7.__u) {
            if (r7.state.__e) {
                var n19 = r7.state.__e;
                r7.__v.__k[0] = function n22(t17, e9, r8) {
                    return t17 && (t17.__v = null, t17.__k = t17.__k && t17.__k.map(function(t18) {
                        return n22(t18, e9, r8);
                    }), t17.__c && t17.__c.__P === e9 && (t17.__e && r8.insertBefore(t17.__e, t17.__d), t17.__c.__e = !0, t17.__c.__P = r8)), t17;
                }(n19, n19.__c.__P, n19.__c.__O);
            }
            var t15;
            for(r7.setState({
                __e: r7.__b = null
            }); t15 = r7.t.pop();)t15.forceUpdate();
        }
    }, c1 = !0 === t14.__h;
    (r7.__u++) || c1 || r7.setState({
        __e: r7.__b = r7.__v.__k[0]
    }), n18.then(i1, i1);
}, $dc040a17866866fa$export$74bf444e3cd11ea5.prototype.componentWillUnmount = function() {
    this.t = [];
}, $dc040a17866866fa$export$74bf444e3cd11ea5.prototype.render = function(n23, t19) {
    if (this.__b) {
        if (this.__v.__k) {
            var e10 = document.createElement("div"), r9 = this.__v.__k[0].__c;
            this.__v.__k[0] = function n24(t20, e13, r12) {
                return t20 && (t20.__c && t20.__c.__H && (t20.__c.__H.__.forEach(function(n25) {
                    "function" == typeof n25.__c && n25.__c();
                }), t20.__c.__H = null), null != (t20 = $dc040a17866866fa$var$S({}, t20)).__c && (t20.__c.__P === r12 && (t20.__c.__P = e13), t20.__c = null), t20.__k = t20.__k && t20.__k.map(function(t21) {
                    return n24(t21, e13, r12);
                })), t20;
            }(this.__b, e10, r9.__O = r9.__P);
        }
        this.__b = null;
    }
    var u5 = t19.__e && (0, $fb96b826c0c5f37a$export$c8a8987d4410bf2d)((0, $fb96b826c0c5f37a$export$ffb0004e005737fa), null, n23.fallback);
    return u5 && (u5.__h = null), [
        (0, $fb96b826c0c5f37a$export$c8a8987d4410bf2d)((0, $fb96b826c0c5f37a$export$ffb0004e005737fa), null, t19.__e ? null : n23.children),
        u5
    ];
};
var $dc040a17866866fa$var$T = function(n26, t22, e14) {
    if (++e14[1] === e14[0] && n26.o.delete(t22), n26.props.revealOrder && ("t" !== n26.props.revealOrder[0] || !n26.o.size)) for(e14 = n26.u; e14;){
        for(; e14.length > 3;)e14.pop()();
        if (e14[1] < e14[0]) break;
        n26.u = e14 = e14[2];
    }
};
function $dc040a17866866fa$var$D(n27) {
    return this.getChildContext = function() {
        return n27.context;
    }, n27.children;
}
function $dc040a17866866fa$var$I(n28) {
    var t23 = this, e15 = n28.i;
    t23.componentWillUnmount = function() {
        (0, $fb96b826c0c5f37a$export$b3890eb0ae9dca99)(null, t23.l), t23.l = null, t23.i = null;
    }, t23.i && t23.i !== e15 && t23.componentWillUnmount(), n28.__v ? (t23.l || (t23.i = e15, t23.l = {
        nodeType: 1,
        parentNode: e15,
        childNodes: [],
        appendChild: function(n29) {
            this.childNodes.push(n29), t23.i.appendChild(n29);
        },
        insertBefore: function(n30, e) {
            this.childNodes.push(n30), t23.i.appendChild(n30);
        },
        removeChild: function(n31) {
            this.childNodes.splice(this.childNodes.indexOf(n31) >>> 1, 1), t23.i.removeChild(n31);
        }
    }), (0, $fb96b826c0c5f37a$export$b3890eb0ae9dca99)((0, $fb96b826c0c5f37a$export$c8a8987d4410bf2d)($dc040a17866866fa$var$D, {
        context: t23.context
    }, n28.__v), t23.l)) : t23.l && t23.componentWillUnmount();
}
function $dc040a17866866fa$export$d39a5bbd09211389(n32, t24) {
    return (0, $fb96b826c0c5f37a$export$c8a8987d4410bf2d)($dc040a17866866fa$var$I, {
        __v: n32,
        i: t24
    });
}
($dc040a17866866fa$export$998bcd577473dd93.prototype = new (0, $fb96b826c0c5f37a$export$16fa2f45be04daa8)).__e = function(n33) {
    var t25 = this, e16 = $dc040a17866866fa$var$U(t25.__v), r13 = t25.o.get(n33);
    return r13[0]++, function(u6) {
        var o2 = function() {
            t25.props.revealOrder ? (r13.push(u6), $dc040a17866866fa$var$T(t25, n33, r13)) : u6();
        };
        e16 ? e16(o2) : o2();
    };
}, $dc040a17866866fa$export$998bcd577473dd93.prototype.render = function(n34) {
    this.u = null, this.o = new Map;
    var t26 = (0, $fb96b826c0c5f37a$export$47e4c5b300681277)(n34.children);
    n34.revealOrder && "b" === n34.revealOrder[0] && t26.reverse();
    for(var e17 = t26.length; e17--;)this.o.set(t26[e17], this.u = [
        1,
        0,
        this.u
    ]);
    return n34.children;
}, $dc040a17866866fa$export$998bcd577473dd93.prototype.componentDidUpdate = $dc040a17866866fa$export$998bcd577473dd93.prototype.componentDidMount = function() {
    var n35 = this;
    this.o.forEach(function(t27, e18) {
        $dc040a17866866fa$var$T(n35, e18, t27);
    });
};
var $dc040a17866866fa$var$j = "undefined" != typeof Symbol && Symbol.for && Symbol.for("react.element") || 60103, $dc040a17866866fa$var$P = /^(?:accent|alignment|arabic|baseline|cap|clip(?!PathU)|color|dominant|fill|flood|font|glyph(?!R)|horiz|marker(?!H|W|U)|overline|paint|stop|strikethrough|stroke|text(?!L)|underline|unicode|units|v|vector|vert|word|writing|x(?!C))[A-Z]/, $dc040a17866866fa$var$V = "undefined" != typeof document, $dc040a17866866fa$var$z = function(n36) {
    return ("undefined" != typeof Symbol && "symbol" == typeof Symbol() ? /fil|che|rad/i : /fil|che|ra/i).test(n36);
};
function $dc040a17866866fa$export$b3890eb0ae9dca99(n37, t28, e19) {
    return null == t28.__k && (t28.textContent = ""), (0, $fb96b826c0c5f37a$export$b3890eb0ae9dca99)(n37, t28), "function" == typeof e19 && e19(), n37 ? n37.__c : null;
}
function $dc040a17866866fa$export$fa8d919ba61d84db(n38, t29, e20) {
    return (0, $fb96b826c0c5f37a$export$fa8d919ba61d84db)(n38, t29), "function" == typeof e20 && e20(), n38 ? n38.__c : null;
}
(0, $fb96b826c0c5f37a$export$16fa2f45be04daa8).prototype.isReactComponent = {}, [
    "componentWillMount",
    "componentWillReceiveProps",
    "componentWillUpdate"
].forEach(function(n39) {
    Object.defineProperty((0, $fb96b826c0c5f37a$export$16fa2f45be04daa8).prototype, n39, {
        configurable: !0,
        get: function() {
            return this["UNSAFE_" + n39];
        },
        set: function(t30) {
            Object.defineProperty(this, n39, {
                configurable: !0,
                writable: !0,
                value: t30
            });
        }
    });
});
var $dc040a17866866fa$var$H = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).event;
function $dc040a17866866fa$var$Z() {}
function $dc040a17866866fa$var$Y() {
    return this.cancelBubble;
}
function $dc040a17866866fa$var$q() {
    return this.defaultPrevented;
}
(0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).event = function(n40) {
    return $dc040a17866866fa$var$H && (n40 = $dc040a17866866fa$var$H(n40)), n40.persist = $dc040a17866866fa$var$Z, n40.isPropagationStopped = $dc040a17866866fa$var$Y, n40.isDefaultPrevented = $dc040a17866866fa$var$q, n40.nativeEvent = n40;
};
var $dc040a17866866fa$var$G, $dc040a17866866fa$var$J = {
    configurable: !0,
    get: function() {
        return this.class;
    }
}, $dc040a17866866fa$var$K = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).vnode;
(0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).vnode = function(n41) {
    var t31 = n41.type, e21 = n41.props, r14 = e21;
    if ("string" == typeof t31) {
        var u7 = -1 === t31.indexOf("-");
        for(var o3 in r14 = {}, e21){
            var i2 = e21[o3];
            $dc040a17866866fa$var$V && "children" === o3 && "noscript" === t31 || "value" === o3 && "defaultValue" in e21 && null == i2 || ("defaultValue" === o3 && "value" in e21 && null == e21.value ? o3 = "value" : "download" === o3 && !0 === i2 ? i2 = "" : /ondoubleclick/i.test(o3) ? o3 = "ondblclick" : /^onchange(textarea|input)/i.test(o3 + t31) && !$dc040a17866866fa$var$z(e21.type) ? o3 = "oninput" : /^onfocus$/i.test(o3) ? o3 = "onfocusin" : /^onblur$/i.test(o3) ? o3 = "onfocusout" : /^on(Ani|Tra|Tou|BeforeInp)/.test(o3) ? o3 = o3.toLowerCase() : u7 && $dc040a17866866fa$var$P.test(o3) ? o3 = o3.replace(/[A-Z0-9]/, "-$&").toLowerCase() : null === i2 && (i2 = void 0), r14[o3] = i2);
        }
        "select" == t31 && r14.multiple && Array.isArray(r14.value) && (r14.value = (0, $fb96b826c0c5f37a$export$47e4c5b300681277)(e21.children).forEach(function(n42) {
            n42.props.selected = -1 != r14.value.indexOf(n42.props.value);
        })), "select" == t31 && null != r14.defaultValue && (r14.value = (0, $fb96b826c0c5f37a$export$47e4c5b300681277)(e21.children).forEach(function(n43) {
            n43.props.selected = r14.multiple ? -1 != r14.defaultValue.indexOf(n43.props.value) : r14.defaultValue == n43.props.value;
        })), n41.props = r14, e21.class != e21.className && ($dc040a17866866fa$var$J.enumerable = "className" in e21, null != e21.className && (r14.class = e21.className), Object.defineProperty(r14, "className", $dc040a17866866fa$var$J));
    }
    n41.$$typeof = $dc040a17866866fa$var$j, $dc040a17866866fa$var$K && $dc040a17866866fa$var$K(n41);
};
var $dc040a17866866fa$var$Q = (0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__r;
(0, $fb96b826c0c5f37a$export$41c562ebe57d11e2).__r = function(n44) {
    $dc040a17866866fa$var$Q && $dc040a17866866fa$var$Q(n44), $dc040a17866866fa$var$G = n44.__c;
};
var $dc040a17866866fa$export$ae55be85d98224ed = {
    ReactCurrentDispatcher: {
        current: {
            readContext: function(n45) {
                return $dc040a17866866fa$var$G.__n[n45.__c].props.value;
            }
        }
    }
}, $dc040a17866866fa$export$83d89fbfd8236492 = "17.0.2";
function $dc040a17866866fa$export$d38cd72104c1f0e9(n46) {
    return (0, $fb96b826c0c5f37a$export$c8a8987d4410bf2d).bind(null, n46);
}
function $dc040a17866866fa$export$a8257692ac88316c(n47) {
    return !!n47 && n47.$$typeof === $dc040a17866866fa$var$j;
}
function $dc040a17866866fa$export$e530037191fcd5d7(n48) {
    return $dc040a17866866fa$export$a8257692ac88316c(n48) ? (0, $fb96b826c0c5f37a$export$e530037191fcd5d7).apply(null, arguments) : n48;
}
function $dc040a17866866fa$export$502457920280e6be(n49) {
    return !!n49.__k && ((0, $fb96b826c0c5f37a$export$b3890eb0ae9dca99)(null, n49), !0);
}
function $dc040a17866866fa$export$466bfc07425424d5(n50) {
    return n50 && (n50.base || 1 === n50.nodeType && n50) || null;
}
var $dc040a17866866fa$export$c78a37762a8d58e1 = function(n51, t32) {
    return n51(t32);
}, $dc040a17866866fa$export$cd75ccfd720a3cd4 = function(n52, t33) {
    return n52(t33);
}, $dc040a17866866fa$export$5f8d39834fd61797 = (0, $fb96b826c0c5f37a$export$ffb0004e005737fa);
var $dc040a17866866fa$export$2e2bcd8739ae039 = {
    useState: (0, $1a9a8ef576b7773d$export$60241385465d0a34),
    useReducer: (0, $1a9a8ef576b7773d$export$13e3392192263954),
    useEffect: (0, $1a9a8ef576b7773d$export$6d9c69b0de29b591),
    useLayoutEffect: (0, $1a9a8ef576b7773d$export$e5c5a5f917a5871c),
    useRef: (0, $1a9a8ef576b7773d$export$b8f5890fc79d6aca),
    useImperativeHandle: (0, $1a9a8ef576b7773d$export$d5a552a76deda3c2),
    useMemo: (0, $1a9a8ef576b7773d$export$1538c33de8887b59),
    useCallback: (0, $1a9a8ef576b7773d$export$35808ee640e87ca7),
    useContext: (0, $1a9a8ef576b7773d$export$fae74005e78b1a27),
    useDebugValue: (0, $1a9a8ef576b7773d$export$dc8fbce3eb94dc1e),
    version: "17.0.2",
    Children: $dc040a17866866fa$export$dca3b0875bd9a954,
    render: $dc040a17866866fa$export$b3890eb0ae9dca99,
    hydrate: $dc040a17866866fa$export$fa8d919ba61d84db,
    unmountComponentAtNode: $dc040a17866866fa$export$502457920280e6be,
    createPortal: $dc040a17866866fa$export$d39a5bbd09211389,
    createElement: (0, $fb96b826c0c5f37a$export$c8a8987d4410bf2d),
    createContext: (0, $fb96b826c0c5f37a$export$fd42f52fd3ae1109),
    createFactory: $dc040a17866866fa$export$d38cd72104c1f0e9,
    cloneElement: $dc040a17866866fa$export$e530037191fcd5d7,
    createRef: (0, $fb96b826c0c5f37a$export$7d1e3a5e95ceca43),
    Fragment: (0, $fb96b826c0c5f37a$export$ffb0004e005737fa),
    isValidElement: $dc040a17866866fa$export$a8257692ac88316c,
    findDOMNode: $dc040a17866866fa$export$466bfc07425424d5,
    Component: (0, $fb96b826c0c5f37a$export$16fa2f45be04daa8),
    PureComponent: $dc040a17866866fa$export$221d75b3f55bb0bd,
    memo: $dc040a17866866fa$export$7c73462e0d25e514,
    forwardRef: $dc040a17866866fa$export$257a8862b851cb5b,
    flushSync: $dc040a17866866fa$export$cd75ccfd720a3cd4,
    unstable_batchedUpdates: $dc040a17866866fa$export$c78a37762a8d58e1,
    StrictMode: (0, $fb96b826c0c5f37a$export$ffb0004e005737fa),
    Suspense: $dc040a17866866fa$export$74bf444e3cd11ea5,
    SuspenseList: $dc040a17866866fa$export$998bcd577473dd93,
    lazy: $dc040a17866866fa$export$488013bae63b21da,
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: $dc040a17866866fa$export$ae55be85d98224ed
};




const $ec8c39fdad15601a$var$THEME_ICONS = {
    light: "outline",
    dark: "solid"
};
class $ec8c39fdad15601a$export$2e2bcd8739ae039 extends (0, $dc040a17866866fa$export$221d75b3f55bb0bd) {
    renderIcon(category) {
        const { icon: icon  } = category;
        if (icon) {
            if (icon.svg) return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("span", {
                class: "flex",
                dangerouslySetInnerHTML: {
                    __html: icon.svg
                }
            });
            if (icon.src) return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("img", {
                src: icon.src
            });
        }
        const categoryIcons = (0, $fcccfb36ed0cde68$export$2e2bcd8739ae039).categories[category.id] || (0, $fcccfb36ed0cde68$export$2e2bcd8739ae039).categories.custom;
        const style = this.props.icons == "auto" ? $ec8c39fdad15601a$var$THEME_ICONS[this.props.theme] : this.props.icons;
        return categoryIcons[style] || categoryIcons;
    }
    render() {
        let selectedCategoryIndex = null;
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("nav", {
            id: "nav",
            class: "padding",
            "data-position": this.props.position,
            dir: this.props.dir,
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                class: "flex relative",
                children: [
                    this.categories.map((category, i)=>{
                        const title = category.name || (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).categories[category.id];
                        const selected = !this.props.unfocused && category.id == this.state.categoryId;
                        if (selected) selectedCategoryIndex = i;
                        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("button", {
                            "aria-label": title,
                            "aria-selected": selected || undefined,
                            title: title,
                            type: "button",
                            class: "flex flex-grow flex-center",
                            onMouseDown: (e)=>e.preventDefault(),
                            onClick: ()=>{
                                this.props.onClick({
                                    category: category,
                                    i: i
                                });
                            },
                            children: this.renderIcon(category)
                        });
                    }),
                    /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                        class: "bar",
                        style: {
                            width: `${100 / this.categories.length}%`,
                            opacity: selectedCategoryIndex == null ? 0 : 1,
                            transform: this.props.dir === "rtl" ? `scaleX(-1) translateX(${selectedCategoryIndex * 100}%)` : `translateX(${selectedCategoryIndex * 100}%)`
                        }
                    })
                ]
            })
        });
    }
    constructor(){
        super();
        this.categories = (0, $7adb23b0109cc36a$export$2d0294657ab35f1b).categories.filter((category)=>{
            return !category.target;
        });
        this.state = {
            categoryId: this.categories[0].id
        };
    }
}





class $e0d4dda61265ff1e$export$2e2bcd8739ae039 extends (0, $dc040a17866866fa$export$221d75b3f55bb0bd) {
    shouldComponentUpdate(nextProps) {
        for(let k in nextProps){
            if (k == "children") continue;
            if (nextProps[k] != this.props[k]) return true;
        }
        return false;
    }
    render() {
        return this.props.children;
    }
}




const $89bd6bb200cc8fef$var$Performance = {
    rowsPerRender: 10
};
class $89bd6bb200cc8fef$export$2e2bcd8739ae039 extends (0, $fb96b826c0c5f37a$export$16fa2f45be04daa8) {
    getInitialState(props = this.props) {
        return {
            skin: (0, $f72b75cf796873c7$export$2e2bcd8739ae039).get("skin") || props.skin,
            theme: this.initTheme(props.theme)
        };
    }
    componentWillMount() {
        this.dir = (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).rtl ? "rtl" : "ltr";
        this.refs = {
            menu: (0, $fb96b826c0c5f37a$export$7d1e3a5e95ceca43)(),
            navigation: (0, $fb96b826c0c5f37a$export$7d1e3a5e95ceca43)(),
            scroll: (0, $fb96b826c0c5f37a$export$7d1e3a5e95ceca43)(),
            search: (0, $fb96b826c0c5f37a$export$7d1e3a5e95ceca43)(),
            searchInput: (0, $fb96b826c0c5f37a$export$7d1e3a5e95ceca43)(),
            skinToneButton: (0, $fb96b826c0c5f37a$export$7d1e3a5e95ceca43)(),
            skinToneRadio: (0, $fb96b826c0c5f37a$export$7d1e3a5e95ceca43)()
        };
        this.initGrid();
        if (this.props.stickySearch == false && this.props.searchPosition == "sticky") {
            console.warn("[EmojiMart] Deprecation warning: `stickySearch` has been renamed `searchPosition`.");
            this.props.searchPosition = "static";
        }
    }
    componentDidMount() {
        this.register();
        this.shadowRoot = this.base.parentNode;
        if (this.props.autoFocus) {
            const { searchInput: searchInput  } = this.refs;
            if (searchInput.current) searchInput.current.focus();
        }
    }
    componentWillReceiveProps(nextProps) {
        this.nextState || (this.nextState = {});
        for(const k1 in nextProps)this.nextState[k1] = nextProps[k1];
        clearTimeout(this.nextStateTimer);
        this.nextStateTimer = setTimeout(()=>{
            let requiresGridReset = false;
            for(const k in this.nextState){
                this.props[k] = this.nextState[k];
                if (k === "custom" || k === "categories") requiresGridReset = true;
            }
            delete this.nextState;
            const nextState = this.getInitialState();
            if (requiresGridReset) return this.reset(nextState);
            this.setState(nextState);
        });
    }
    componentWillUnmount() {
        this.unregister();
    }
    async reset(nextState = {}) {
        await (0, $7adb23b0109cc36a$export$2cd8252107eb640b)(this.props);
        this.initGrid();
        this.unobserve();
        this.setState(nextState, ()=>{
            this.observeCategories();
            this.observeRows();
        });
    }
    register() {
        document.addEventListener("click", this.handleClickOutside);
        this.observe();
    }
    unregister() {
        document.removeEventListener("click", this.handleClickOutside);
        this.darkMedia?.removeEventListener("change", this.darkMediaCallback);
        this.unobserve();
    }
    observe() {
        this.observeCategories();
        this.observeRows();
    }
    unobserve({ except: except = []  } = {}) {
        if (!Array.isArray(except)) except = [
            except
        ];
        for (const observer of this.observers){
            if (except.includes(observer)) continue;
            observer.disconnect();
        }
        this.observers = [].concat(except);
    }
    initGrid() {
        const { categories: categories  } = (0, $7adb23b0109cc36a$export$2d0294657ab35f1b);
        this.refs.categories = new Map();
        const navKey = (0, $7adb23b0109cc36a$export$2d0294657ab35f1b).categories.map((category)=>category.id).join(",");
        if (this.navKey && this.navKey != navKey) this.refs.scroll.current && (this.refs.scroll.current.scrollTop = 0);
        this.navKey = navKey;
        this.grid = [];
        this.grid.setsize = 0;
        const addRow = (rows, category)=>{
            const row = [];
            row.__categoryId = category.id;
            row.__index = rows.length;
            this.grid.push(row);
            const rowIndex = this.grid.length - 1;
            const rowRef = rowIndex % $89bd6bb200cc8fef$var$Performance.rowsPerRender ? {} : (0, $fb96b826c0c5f37a$export$7d1e3a5e95ceca43)();
            rowRef.index = rowIndex;
            rowRef.posinset = this.grid.setsize + 1;
            rows.push(rowRef);
            return row;
        };
        for (let category1 of categories){
            const rows = [];
            let row = addRow(rows, category1);
            for (let emoji of category1.emojis){
                if (row.length == this.getPerLine()) row = addRow(rows, category1);
                this.grid.setsize += 1;
                row.push(emoji);
            }
            this.refs.categories.set(category1.id, {
                root: (0, $fb96b826c0c5f37a$export$7d1e3a5e95ceca43)(),
                rows: rows
            });
        }
    }
    initTheme(theme) {
        if (theme != "auto") return theme;
        if (!this.darkMedia) {
            this.darkMedia = matchMedia("(prefers-color-scheme: dark)");
            if (this.darkMedia.media.match(/^not/)) return "light";
            this.darkMedia.addEventListener("change", this.darkMediaCallback);
        }
        return this.darkMedia.matches ? "dark" : "light";
    }
    initDynamicPerLine(props = this.props) {
        if (!props.dynamicWidth) return;
        const { element: element , emojiButtonSize: emojiButtonSize  } = props;
        const calculatePerLine = ()=>{
            const { width: width  } = element.getBoundingClientRect();
            return Math.floor(width / emojiButtonSize);
        };
        const observer = new ResizeObserver(()=>{
            this.unobserve({
                except: observer
            });
            this.setState({
                perLine: calculatePerLine()
            }, ()=>{
                this.initGrid();
                this.forceUpdate(()=>{
                    this.observeCategories();
                    this.observeRows();
                });
            });
        });
        observer.observe(element);
        this.observers.push(observer);
        return calculatePerLine();
    }
    getPerLine() {
        return this.state.perLine || this.props.perLine;
    }
    getEmojiByPos([p1, p2]) {
        const grid = this.state.searchResults || this.grid;
        const emoji = grid[p1] && grid[p1][p2];
        if (!emoji) return;
        return (0, $c4d155af13ad4d4b$export$2e2bcd8739ae039).get(emoji);
    }
    observeCategories() {
        const navigation = this.refs.navigation.current;
        if (!navigation) return;
        const visibleCategories = new Map();
        const setFocusedCategory = (categoryId)=>{
            if (categoryId != navigation.state.categoryId) navigation.setState({
                categoryId: categoryId
            });
        };
        const observerOptions = {
            root: this.refs.scroll.current,
            threshold: [
                0.0,
                1.0
            ]
        };
        const observer = new IntersectionObserver((entries)=>{
            for (const entry of entries){
                const id = entry.target.dataset.id;
                visibleCategories.set(id, entry.intersectionRatio);
            }
            const ratios = [
                ...visibleCategories
            ];
            for (const [id, ratio] of ratios)if (ratio) {
                setFocusedCategory(id);
                break;
            }
        }, observerOptions);
        for (const { root: root  } of this.refs.categories.values())observer.observe(root.current);
        this.observers.push(observer);
    }
    observeRows() {
        const visibleRows = {
            ...this.state.visibleRows
        };
        const observer = new IntersectionObserver((entries)=>{
            for (const entry of entries){
                const index = parseInt(entry.target.dataset.index);
                if (entry.isIntersecting) visibleRows[index] = true;
                else delete visibleRows[index];
            }
            this.setState({
                visibleRows: visibleRows
            });
        }, {
            root: this.refs.scroll.current,
            rootMargin: `${this.props.emojiButtonSize * ($89bd6bb200cc8fef$var$Performance.rowsPerRender + 5)}px 0px ${this.props.emojiButtonSize * $89bd6bb200cc8fef$var$Performance.rowsPerRender}px`
        });
        for (const { rows: rows  } of this.refs.categories.values()){
            for (const row of rows)if (row.current) observer.observe(row.current);
        }
        this.observers.push(observer);
    }
    preventDefault(e) {
        e.preventDefault();
    }
    unfocusSearch() {
        const input = this.refs.searchInput.current;
        if (!input) return;
        input.blur();
    }
    navigate({ e: e , input: input , left: left , right: right , up: up , down: down  }) {
        const grid = this.state.searchResults || this.grid;
        if (!grid.length) return;
        let [p1, p2] = this.state.pos;
        const pos = (()=>{
            if (p1 == 0) {
                if (p2 == 0 && !e.repeat && (left || up)) return null;
            }
            if (p1 == -1) {
                if (!e.repeat && (right || down) && input.selectionStart == input.value.length) return [
                    0,
                    0
                ];
                return null;
            }
            if (left || right) {
                let row = grid[p1];
                const increment = left ? -1 : 1;
                p2 += increment;
                if (!row[p2]) {
                    p1 += increment;
                    row = grid[p1];
                    if (!row) {
                        p1 = left ? 0 : grid.length - 1;
                        p2 = left ? 0 : grid[p1].length - 1;
                        return [
                            p1,
                            p2
                        ];
                    }
                    p2 = left ? row.length - 1 : 0;
                }
                return [
                    p1,
                    p2
                ];
            }
            if (up || down) {
                p1 += up ? -1 : 1;
                const row = grid[p1];
                if (!row) {
                    p1 = up ? 0 : grid.length - 1;
                    p2 = up ? 0 : grid[p1].length - 1;
                    return [
                        p1,
                        p2
                    ];
                }
                if (!row[p2]) p2 = row.length - 1;
                return [
                    p1,
                    p2
                ];
            }
        })();
        if (pos) e.preventDefault();
        else {
            if (this.state.pos[0] > -1) this.setState({
                pos: [
                    -1,
                    -1
                ]
            });
            return;
        }
        this.setState({
            pos: pos,
            keyboard: true
        }, ()=>{
            this.scrollTo({
                row: pos[0]
            });
        });
    }
    scrollTo({ categoryId: categoryId , row: row  }) {
        const grid = this.state.searchResults || this.grid;
        if (!grid.length) return;
        const scroll = this.refs.scroll.current;
        const scrollRect = scroll.getBoundingClientRect();
        let scrollTop = 0;
        if (row >= 0) categoryId = grid[row].__categoryId;
        if (categoryId) {
            const ref = this.refs[categoryId] || this.refs.categories.get(categoryId).root;
            const categoryRect = ref.current.getBoundingClientRect();
            scrollTop = categoryRect.top - (scrollRect.top - scroll.scrollTop) + 1;
        }
        if (row >= 0) {
            if (!row) scrollTop = 0;
            else {
                const rowIndex = grid[row].__index;
                const rowTop = scrollTop + rowIndex * this.props.emojiButtonSize;
                const rowBot = rowTop + this.props.emojiButtonSize + this.props.emojiButtonSize * 0.88;
                if (rowTop < scroll.scrollTop) scrollTop = rowTop;
                else if (rowBot > scroll.scrollTop + scrollRect.height) scrollTop = rowBot - scrollRect.height;
                else return;
            }
        }
        this.ignoreMouse();
        scroll.scrollTop = scrollTop;
    }
    ignoreMouse() {
        this.mouseIsIgnored = true;
        clearTimeout(this.ignoreMouseTimer);
        this.ignoreMouseTimer = setTimeout(()=>{
            delete this.mouseIsIgnored;
        }, 100);
    }
    handleEmojiOver(pos) {
        if (this.mouseIsIgnored || this.state.showSkins) return;
        this.setState({
            pos: pos || [
                -1,
                -1
            ],
            keyboard: false
        });
    }
    handleEmojiClick({ e: e , emoji: emoji , pos: pos  }) {
        if (!this.props.onEmojiSelect) return;
        if (!emoji && pos) emoji = this.getEmojiByPos(pos);
        if (emoji) {
            const emojiData = (0, $693b183b0a78708f$export$d10ac59fbe52a745)(emoji, {
                skinIndex: this.state.skin - 1
            });
            if (this.props.maxFrequentRows) (0, $b22cfd0a55410b4f$export$2e2bcd8739ae039).add(emojiData, this.props);
            this.props.onEmojiSelect(emojiData, e);
        }
    }
    closeSkins() {
        if (!this.state.showSkins) return;
        this.setState({
            showSkins: null,
            tempSkin: null
        });
        this.base.removeEventListener("click", this.handleBaseClick);
        this.base.removeEventListener("keydown", this.handleBaseKeydown);
    }
    handleSkinMouseOver(tempSkin) {
        this.setState({
            tempSkin: tempSkin
        });
    }
    handleSkinClick(skin) {
        this.ignoreMouse();
        this.closeSkins();
        this.setState({
            skin: skin,
            tempSkin: null
        });
        (0, $f72b75cf796873c7$export$2e2bcd8739ae039).set("skin", skin);
    }
    renderNav() {
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)((0, $ec8c39fdad15601a$export$2e2bcd8739ae039), {
            ref: this.refs.navigation,
            icons: this.props.icons,
            theme: this.state.theme,
            dir: this.dir,
            unfocused: !!this.state.searchResults,
            position: this.props.navPosition,
            onClick: this.handleCategoryClick
        }, this.navKey);
    }
    renderPreview() {
        const emoji = this.getEmojiByPos(this.state.pos);
        const noSearchResults = this.state.searchResults && !this.state.searchResults.length;
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
            id: "preview",
            class: "flex flex-middle",
            dir: this.dir,
            "data-position": this.props.previewPosition,
            children: [
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                    class: "flex flex-middle flex-grow",
                    children: [
                        /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                            class: "flex flex-auto flex-middle flex-center",
                            style: {
                                height: this.props.emojiButtonSize,
                                fontSize: this.props.emojiButtonSize
                            },
                            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)((0, $254755d3f438722f$export$2e2bcd8739ae039), {
                                emoji: emoji,
                                id: noSearchResults ? this.props.noResultsEmoji || "cry" : this.props.previewEmoji || (this.props.previewPosition == "top" ? "point_down" : "point_up"),
                                set: this.props.set,
                                size: this.props.emojiButtonSize,
                                skin: this.state.tempSkin || this.state.skin,
                                spritesheet: true,
                                getSpritesheetURL: this.props.getSpritesheetURL
                            })
                        }),
                        /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                            class: `margin-${this.dir[0]}`,
                            children: emoji || noSearchResults ? /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                                class: `padding-${this.dir[2]} align-${this.dir[0]}`,
                                children: [
                                    /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                                        class: "preview-title ellipsis",
                                        children: emoji ? emoji.name : (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).search_no_results_1
                                    }),
                                    /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                                        class: "preview-subtitle ellipsis color-c",
                                        children: emoji ? emoji.skins[0].shortcodes : (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).search_no_results_2
                                    })
                                ]
                            }) : /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                                class: "preview-placeholder color-c",
                                children: (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).pick
                            })
                        })
                    ]
                }),
                !emoji && this.props.skinTonePosition == "preview" && this.renderSkinToneButton()
            ]
        });
    }
    renderEmojiButton(emoji, { pos: pos , posinset: posinset , grid: grid  }) {
        const size = this.props.emojiButtonSize;
        const skin = this.state.tempSkin || this.state.skin;
        const emojiSkin = emoji.skins[skin - 1] || emoji.skins[0];
        const native = emojiSkin.native;
        const selected = (0, $693b183b0a78708f$export$9cb4719e2e525b7a)(this.state.pos, pos);
        const key = pos.concat(emoji.id).join("");
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)((0, $e0d4dda61265ff1e$export$2e2bcd8739ae039), {
            selected: selected,
            skin: skin,
            size: size,
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("button", {
                "aria-label": native,
                "aria-selected": selected || undefined,
                "aria-posinset": posinset,
                "aria-setsize": grid.setsize,
                "data-keyboard": this.state.keyboard,
                title: this.props.previewPosition == "none" ? emoji.name : undefined,
                type: "button",
                class: "flex flex-center flex-middle",
                tabindex: "-1",
                onClick: (e)=>this.handleEmojiClick({
                        e: e,
                        emoji: emoji
                    }),
                onMouseEnter: ()=>this.handleEmojiOver(pos),
                onMouseLeave: ()=>this.handleEmojiOver(),
                style: {
                    width: this.props.emojiButtonSize,
                    height: this.props.emojiButtonSize,
                    fontSize: this.props.emojiSize,
                    lineHeight: 0
                },
                children: [
                    /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                        "aria-hidden": "true",
                        class: "background",
                        style: {
                            borderRadius: this.props.emojiButtonRadius,
                            backgroundColor: this.props.emojiButtonColors ? this.props.emojiButtonColors[(posinset - 1) % this.props.emojiButtonColors.length] : undefined
                        }
                    }),
                    /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)((0, $254755d3f438722f$export$2e2bcd8739ae039), {
                        emoji: emoji,
                        set: this.props.set,
                        size: this.props.emojiSize,
                        skin: skin,
                        spritesheet: true,
                        getSpritesheetURL: this.props.getSpritesheetURL
                    })
                ]
            })
        }, key);
    }
    renderSearch() {
        const renderSkinTone = this.props.previewPosition == "none" || this.props.skinTonePosition == "search";
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
            children: [
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                    class: "spacer"
                }),
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                    class: "flex flex-middle",
                    children: [
                        /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                            class: "search relative flex-grow",
                            children: [
                                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("input", {
                                    type: "search",
                                    ref: this.refs.searchInput,
                                    placeholder: (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).search,
                                    onClick: this.handleSearchClick,
                                    onInput: this.handleSearchInput,
                                    onKeyDown: this.handleSearchKeyDown,
                                    autoComplete: "off"
                                }),
                                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("span", {
                                    class: "icon loupe flex",
                                    children: (0, $fcccfb36ed0cde68$export$2e2bcd8739ae039).search.loupe
                                }),
                                this.state.searchResults && /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("button", {
                                    title: "Clear",
                                    "aria-label": "Clear",
                                    type: "button",
                                    class: "icon delete flex",
                                    onClick: this.clearSearch,
                                    onMouseDown: this.preventDefault,
                                    children: (0, $fcccfb36ed0cde68$export$2e2bcd8739ae039).search.delete
                                })
                            ]
                        }),
                        renderSkinTone && this.renderSkinToneButton()
                    ]
                })
            ]
        });
    }
    renderSearchResults() {
        const { searchResults: searchResults  } = this.state;
        if (!searchResults) return null;
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
            class: "category",
            ref: this.refs.search,
            children: [
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                    class: `sticky padding-small align-${this.dir[0]}`,
                    children: (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).categories.search
                }),
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                    children: !searchResults.length ? /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                        class: `padding-small align-${this.dir[0]}`,
                        children: this.props.onAddCustomEmoji && /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("a", {
                            onClick: this.props.onAddCustomEmoji,
                            children: (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).add_custom
                        })
                    }) : searchResults.map((row, i)=>{
                        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                            class: "flex",
                            children: row.map((emoji, ii)=>{
                                return this.renderEmojiButton(emoji, {
                                    pos: [
                                        i,
                                        ii
                                    ],
                                    posinset: i * this.props.perLine + ii + 1,
                                    grid: searchResults
                                });
                            })
                        });
                    })
                })
            ]
        });
    }
    renderCategories() {
        const { categories: categories  } = (0, $7adb23b0109cc36a$export$2d0294657ab35f1b);
        const hidden = !!this.state.searchResults;
        const perLine = this.getPerLine();
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
            style: {
                visibility: hidden ? "hidden" : undefined,
                display: hidden ? "none" : undefined,
                height: "100%"
            },
            children: categories.map((category)=>{
                const { root: root , rows: rows  } = this.refs.categories.get(category.id);
                return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                    "data-id": category.target ? category.target.id : category.id,
                    class: "category",
                    ref: root,
                    children: [
                        /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                            class: `sticky padding-small align-${this.dir[0]}`,
                            children: category.name || (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).categories[category.id]
                        }),
                        /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                            class: "relative",
                            style: {
                                height: rows.length * this.props.emojiButtonSize
                            },
                            children: rows.map((row, i)=>{
                                const targetRow = row.index - row.index % $89bd6bb200cc8fef$var$Performance.rowsPerRender;
                                const visible = this.state.visibleRows[targetRow];
                                const ref = "current" in row ? row : undefined;
                                if (!visible && !ref) return null;
                                const start = i * perLine;
                                const end = start + perLine;
                                const emojiIds = category.emojis.slice(start, end);
                                if (emojiIds.length < perLine) emojiIds.push(...new Array(perLine - emojiIds.length));
                                return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                                    "data-index": row.index,
                                    ref: ref,
                                    class: "flex row",
                                    style: {
                                        top: i * this.props.emojiButtonSize
                                    },
                                    children: visible && emojiIds.map((emojiId, ii)=>{
                                        if (!emojiId) return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                                            style: {
                                                width: this.props.emojiButtonSize,
                                                height: this.props.emojiButtonSize
                                            }
                                        });
                                        const emoji = (0, $c4d155af13ad4d4b$export$2e2bcd8739ae039).get(emojiId);
                                        return this.renderEmojiButton(emoji, {
                                            pos: [
                                                row.index,
                                                ii
                                            ],
                                            posinset: row.posinset + ii,
                                            grid: this.grid
                                        });
                                    })
                                }, row.index);
                            })
                        })
                    ]
                });
            })
        });
    }
    renderSkinToneButton() {
        if (this.props.skinTonePosition == "none") return null;
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
            class: "flex flex-auto flex-center flex-middle",
            style: {
                position: "relative",
                width: this.props.emojiButtonSize,
                height: this.props.emojiButtonSize
            },
            children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("button", {
                type: "button",
                ref: this.refs.skinToneButton,
                class: "skin-tone-button flex flex-auto flex-center flex-middle",
                "aria-selected": this.state.showSkins ? "" : undefined,
                "aria-label": (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).skins.choose,
                title: (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).skins.choose,
                onClick: this.openSkins,
                style: {
                    width: this.props.emojiSize,
                    height: this.props.emojiSize
                },
                children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("span", {
                    class: `skin-tone skin-tone-${this.state.skin}`
                })
            })
        });
    }
    renderLiveRegion() {
        const emoji = this.getEmojiByPos(this.state.pos);
        const contents = emoji ? emoji.name : "";
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
            "aria-live": "polite",
            class: "sr-only",
            children: contents
        });
    }
    renderSkins() {
        const skinToneButton = this.refs.skinToneButton.current;
        const skinToneButtonRect = skinToneButton.getBoundingClientRect();
        const baseRect = this.base.getBoundingClientRect();
        const position = {};
        if (this.dir == "ltr") position.right = baseRect.right - skinToneButtonRect.right - 3;
        else position.left = skinToneButtonRect.left - baseRect.left - 3;
        if (this.props.previewPosition == "bottom" && this.props.skinTonePosition == "preview") position.bottom = baseRect.bottom - skinToneButtonRect.top + 6;
        else {
            position.top = skinToneButtonRect.bottom - baseRect.top + 3;
            position.bottom = "auto";
        }
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
            ref: this.refs.menu,
            role: "radiogroup",
            dir: this.dir,
            "aria-label": (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).skins.choose,
            class: "menu hidden",
            "data-position": position.top ? "top" : "bottom",
            style: position,
            children: [
                ...Array(6).keys()
            ].map((i)=>{
                const skin = i + 1;
                const checked = this.state.skin == skin;
                return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                    children: [
                        /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("input", {
                            type: "radio",
                            name: "skin-tone",
                            value: skin,
                            "aria-label": (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).skins[skin],
                            ref: checked ? this.refs.skinToneRadio : null,
                            defaultChecked: checked,
                            onChange: ()=>this.handleSkinMouseOver(skin),
                            onKeyDown: (e)=>{
                                if (e.code == "Enter" || e.code == "Space" || e.code == "Tab") {
                                    e.preventDefault();
                                    this.handleSkinClick(skin);
                                }
                            }
                        }),
                        /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("button", {
                            "aria-hidden": "true",
                            tabindex: "-1",
                            onClick: ()=>this.handleSkinClick(skin),
                            onMouseEnter: ()=>this.handleSkinMouseOver(skin),
                            onMouseLeave: ()=>this.handleSkinMouseOver(),
                            class: "option flex flex-grow flex-middle",
                            children: [
                                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("span", {
                                    class: `skin-tone skin-tone-${skin}`
                                }),
                                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("span", {
                                    class: "margin-small-lr",
                                    children: (0, $7adb23b0109cc36a$export$dbe3113d60765c1a).skins[skin]
                                })
                            ]
                        })
                    ]
                });
            })
        });
    }
    render() {
        const lineWidth = this.props.perLine * this.props.emojiButtonSize;
        return /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("section", {
            id: "root",
            class: "flex flex-column",
            dir: this.dir,
            style: {
                width: this.props.dynamicWidth ? "100%" : `calc(${lineWidth}px + (var(--padding) + var(--sidebar-width)))`
            },
            "data-emoji-set": this.props.set,
            "data-theme": this.state.theme,
            "data-menu": this.state.showSkins ? "" : undefined,
            children: [
                this.props.previewPosition == "top" && this.renderPreview(),
                this.props.navPosition == "top" && this.renderNav(),
                this.props.searchPosition == "sticky" && /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                    class: "padding-lr",
                    children: this.renderSearch()
                }),
                /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                    ref: this.refs.scroll,
                    class: "scroll flex-grow padding-lr",
                    children: /*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)("div", {
                        style: {
                            width: this.props.dynamicWidth ? "100%" : lineWidth,
                            height: "100%"
                        },
                        children: [
                            this.props.searchPosition == "static" && this.renderSearch(),
                            this.renderSearchResults(),
                            this.renderCategories()
                        ]
                    })
                }),
                this.props.navPosition == "bottom" && this.renderNav(),
                this.props.previewPosition == "bottom" && this.renderPreview(),
                this.state.showSkins && this.renderSkins(),
                this.renderLiveRegion()
            ]
        });
    }
    constructor(props){
        super();
        (0, $c770c458706daa72$export$2e2bcd8739ae039)(this, "darkMediaCallback", ()=>{
            if (this.props.theme != "auto") return;
            this.setState({
                theme: this.darkMedia.matches ? "dark" : "light"
            });
        });
        (0, $c770c458706daa72$export$2e2bcd8739ae039)(this, "handleClickOutside", (e)=>{
            const { element: element  } = this.props;
            if (e.target != element) {
                if (this.state.showSkins) this.closeSkins();
                if (this.props.onClickOutside) this.props.onClickOutside(e);
            }
        });
        (0, $c770c458706daa72$export$2e2bcd8739ae039)(this, "handleBaseClick", (e)=>{
            if (!this.state.showSkins) return;
            if (!e.target.closest(".menu")) {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.closeSkins();
            }
        });
        (0, $c770c458706daa72$export$2e2bcd8739ae039)(this, "handleBaseKeydown", (e)=>{
            if (!this.state.showSkins) return;
            if (e.key == "Escape") {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.closeSkins();
            }
        });
        (0, $c770c458706daa72$export$2e2bcd8739ae039)(this, "handleSearchClick", ()=>{
            const emoji = this.getEmojiByPos(this.state.pos);
            if (!emoji) return;
            this.setState({
                pos: [
                    -1,
                    -1
                ]
            });
        });
        (0, $c770c458706daa72$export$2e2bcd8739ae039)(this, "handleSearchInput", async ()=>{
            const input = this.refs.searchInput.current;
            if (!input) return;
            const { value: value  } = input;
            const searchResults = await (0, $c4d155af13ad4d4b$export$2e2bcd8739ae039).search(value);
            const afterRender = ()=>{
                if (!this.refs.scroll.current) return;
                this.refs.scroll.current.scrollTop = 0;
            };
            if (!searchResults) return this.setState({
                searchResults: searchResults,
                pos: [
                    -1,
                    -1
                ]
            }, afterRender);
            const pos = input.selectionStart == input.value.length ? [
                0,
                0
            ] : [
                -1,
                -1
            ];
            const grid = [];
            grid.setsize = searchResults.length;
            let row = null;
            for (let emoji of searchResults){
                if (!grid.length || row.length == this.getPerLine()) {
                    row = [];
                    row.__categoryId = "search";
                    row.__index = grid.length;
                    grid.push(row);
                }
                row.push(emoji);
            }
            this.ignoreMouse();
            this.setState({
                searchResults: grid,
                pos: pos
            }, afterRender);
        });
        (0, $c770c458706daa72$export$2e2bcd8739ae039)(this, "handleSearchKeyDown", (e)=>{
            // const specialKey = e.altKey || e.ctrlKey || e.metaKey
            const input = e.currentTarget;
            e.stopImmediatePropagation();
            switch(e.key){
                case "ArrowLeft":
                    // if (specialKey) return
                    // e.preventDefault()
                    this.navigate({
                        e: e,
                        input: input,
                        left: true
                    });
                    break;
                case "ArrowRight":
                    // if (specialKey) return
                    // e.preventDefault()
                    this.navigate({
                        e: e,
                        input: input,
                        right: true
                    });
                    break;
                case "ArrowUp":
                    // if (specialKey) return
                    // e.preventDefault()
                    this.navigate({
                        e: e,
                        input: input,
                        up: true
                    });
                    break;
                case "ArrowDown":
                    // if (specialKey) return
                    // e.preventDefault()
                    this.navigate({
                        e: e,
                        input: input,
                        down: true
                    });
                    break;
                case "Enter":
                    e.preventDefault();
                    this.handleEmojiClick({
                        e: e,
                        pos: this.state.pos
                    });
                    break;
                case "Escape":
                    e.preventDefault();
                    if (this.state.searchResults) this.clearSearch();
                    else this.unfocusSearch();
                    break;
                default:
                    break;
            }
        });
        (0, $c770c458706daa72$export$2e2bcd8739ae039)(this, "clearSearch", ()=>{
            const input = this.refs.searchInput.current;
            if (!input) return;
            input.value = "";
            input.focus();
            this.handleSearchInput();
        });
        (0, $c770c458706daa72$export$2e2bcd8739ae039)(this, "handleCategoryClick", ({ category: category , i: i  })=>{
            this.scrollTo(i == 0 ? {
                row: -1
            } : {
                categoryId: category.id
            });
        });
        (0, $c770c458706daa72$export$2e2bcd8739ae039)(this, "openSkins", (e)=>{
            const { currentTarget: currentTarget  } = e;
            const rect = currentTarget.getBoundingClientRect();
            this.setState({
                showSkins: rect
            }, async ()=>{
                // Firefox requires 2 frames for the transition to consistenly work
                await (0, $693b183b0a78708f$export$e772c8ff12451969)(2);
                const menu = this.refs.menu.current;
                if (!menu) return;
                menu.classList.remove("hidden");
                this.refs.skinToneRadio.current.focus();
                this.base.addEventListener("click", this.handleBaseClick, true);
                this.base.addEventListener("keydown", this.handleBaseKeydown, true);
            });
        });
        this.observers = [];
        this.state = {
            pos: [
                -1,
                -1
            ],
            perLine: this.initDynamicPerLine(props),
            visibleRows: {
                0: true
            },
            ...this.getInitialState(props)
        };
    }
}









class $efa000751917694d$export$2e2bcd8739ae039 extends (0, $26f27c338a96b1a6$export$2e2bcd8739ae039) {
    async connectedCallback() {
        const props = (0, $7adb23b0109cc36a$export$75fe5f91d452f94b)(this.props, (0, $b247ea80b67298d5$export$2e2bcd8739ae039), this);
        props.element = this;
        props.ref = (component)=>{
            this.component = component;
        };
        await (0, $7adb23b0109cc36a$export$2cd8252107eb640b)(props);
        if (this.disconnected) return;
        (0, $fb96b826c0c5f37a$export$b3890eb0ae9dca99)(/*#__PURE__*/ (0, $bd9dd35321b03dd4$export$34b9dba7ce09269b)((0, $89bd6bb200cc8fef$export$2e2bcd8739ae039), {
            ...props
        }), this.shadowRoot);
    }
    constructor(props){
        super(props, {
            styles: (0, (/*@__PURE__*/$parcel$interopDefault($329d53ba9fd7125f$exports)))
        });
    }
}
(0, $c770c458706daa72$export$2e2bcd8739ae039)($efa000751917694d$export$2e2bcd8739ae039, "Props", (0, $b247ea80b67298d5$export$2e2bcd8739ae039));
if (typeof customElements !== "undefined" && !customElements.get("em-emoji-picker")) customElements.define("em-emoji-picker", $efa000751917694d$export$2e2bcd8739ae039);


var $329d53ba9fd7125f$exports = {};
$329d53ba9fd7125f$exports = ":host {\n  width: min-content;\n  height: 435px;\n  min-height: 230px;\n  border-radius: var(--border-radius);\n  box-shadow: var(--shadow);\n  --border-radius: 10px;\n  --category-icon-size: 18px;\n  --font-family: -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", sans-serif;\n  --font-size: 15px;\n  --preview-placeholder-size: 21px;\n  --preview-title-size: 1.1em;\n  --preview-subtitle-size: .9em;\n  --shadow-color: 0deg 0% 0%;\n  --shadow: .3px .5px 2.7px hsl(var(--shadow-color) / .14), .4px .8px 1px -3.2px hsl(var(--shadow-color) / .14), 1px 2px 2.5px -4.5px hsl(var(--shadow-color) / .14);\n  display: flex;\n}\n\n[data-theme=\"light\"] {\n  --em-rgb-color: var(--rgb-color, 34, 36, 39);\n  --em-rgb-accent: var(--rgb-accent, 34, 102, 237);\n  --em-rgb-background: var(--rgb-background, 255, 255, 255);\n  --em-rgb-input: var(--rgb-input, 255, 255, 255);\n  --em-color-border: var(--color-border, rgba(0, 0, 0, .05));\n  --em-color-border-over: var(--color-border-over, rgba(0, 0, 0, .1));\n}\n\n[data-theme=\"dark\"] {\n  --em-rgb-color: var(--rgb-color, 222, 222, 221);\n  --em-rgb-accent: var(--rgb-accent, 58, 130, 247);\n  --em-rgb-background: var(--rgb-background, 21, 22, 23);\n  --em-rgb-input: var(--rgb-input, 0, 0, 0);\n  --em-color-border: var(--color-border, rgba(255, 255, 255, .1));\n  --em-color-border-over: var(--color-border-over, rgba(255, 255, 255, .2));\n}\n\n#root {\n  --color-a: rgb(var(--em-rgb-color));\n  --color-b: rgba(var(--em-rgb-color), .65);\n  --color-c: rgba(var(--em-rgb-color), .45);\n  --padding: 12px;\n  --padding-small: calc(var(--padding) / 2);\n  --sidebar-width: 16px;\n  --duration: 225ms;\n  --duration-fast: 125ms;\n  --duration-instant: 50ms;\n  --easing: cubic-bezier(.4, 0, .2, 1);\n  width: 100%;\n  text-align: left;\n  border-radius: var(--border-radius);\n  background-color: rgb(var(--em-rgb-background));\n  position: relative;\n}\n\n@media (prefers-reduced-motion) {\n  #root {\n    --duration: 0;\n    --duration-fast: 0;\n    --duration-instant: 0;\n  }\n}\n\n#root[data-menu] button {\n  cursor: auto;\n}\n\n#root[data-menu] .menu button {\n  cursor: pointer;\n}\n\n:host, #root, input, button {\n  color: rgb(var(--em-rgb-color));\n  font-family: var(--font-family);\n  font-size: var(--font-size);\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  line-height: normal;\n}\n\n*, :before, :after {\n  box-sizing: border-box;\n  min-width: 0;\n  margin: 0;\n  padding: 0;\n}\n\n.relative {\n  position: relative;\n}\n\n.flex {\n  display: flex;\n}\n\n.flex-auto {\n  flex: none;\n}\n\n.flex-center {\n  justify-content: center;\n}\n\n.flex-column {\n  flex-direction: column;\n}\n\n.flex-grow {\n  flex: auto;\n}\n\n.flex-middle {\n  align-items: center;\n}\n\n.flex-wrap {\n  flex-wrap: wrap;\n}\n\n.padding {\n  padding: var(--padding);\n}\n\n.padding-t {\n  padding-top: var(--padding);\n}\n\n.padding-lr {\n  padding-left: var(--padding);\n  padding-right: var(--padding);\n}\n\n.padding-r {\n  padding-right: var(--padding);\n}\n\n.padding-small {\n  padding: var(--padding-small);\n}\n\n.padding-small-b {\n  padding-bottom: var(--padding-small);\n}\n\n.padding-small-lr {\n  padding-left: var(--padding-small);\n  padding-right: var(--padding-small);\n}\n\n.margin {\n  margin: var(--padding);\n}\n\n.margin-r {\n  margin-right: var(--padding);\n}\n\n.margin-l {\n  margin-left: var(--padding);\n}\n\n.margin-small-l {\n  margin-left: var(--padding-small);\n}\n\n.margin-small-lr {\n  margin-left: var(--padding-small);\n  margin-right: var(--padding-small);\n}\n\n.align-l {\n  text-align: left;\n}\n\n.align-r {\n  text-align: right;\n}\n\n.color-a {\n  color: var(--color-a);\n}\n\n.color-b {\n  color: var(--color-b);\n}\n\n.color-c {\n  color: var(--color-c);\n}\n\n.ellipsis {\n  white-space: nowrap;\n  max-width: 100%;\n  width: auto;\n  text-overflow: ellipsis;\n  overflow: hidden;\n}\n\n.sr-only {\n  width: 1px;\n  height: 1px;\n  position: absolute;\n  top: auto;\n  left: -10000px;\n  overflow: hidden;\n}\n\na {\n  cursor: pointer;\n  color: rgb(var(--em-rgb-accent));\n}\n\na:hover {\n  text-decoration: underline;\n}\n\n.spacer {\n  height: 10px;\n}\n\n[dir=\"rtl\"] .scroll {\n  padding-left: 0;\n  padding-right: var(--padding);\n}\n\n.scroll {\n  padding-right: 0;\n  overflow-x: hidden;\n  overflow-y: auto;\n}\n\n.scroll::-webkit-scrollbar {\n  width: var(--sidebar-width);\n  height: var(--sidebar-width);\n}\n\n.scroll::-webkit-scrollbar-track {\n  border: 0;\n}\n\n.scroll::-webkit-scrollbar-button {\n  width: 0;\n  height: 0;\n  display: none;\n}\n\n.scroll::-webkit-scrollbar-corner {\n  background-color: rgba(0, 0, 0, 0);\n}\n\n.scroll::-webkit-scrollbar-thumb {\n  min-height: 20%;\n  min-height: 65px;\n  border: 4px solid rgb(var(--em-rgb-background));\n  border-radius: 8px;\n}\n\n.scroll::-webkit-scrollbar-thumb:hover {\n  background-color: var(--em-color-border-over) !important;\n}\n\n.scroll:hover::-webkit-scrollbar-thumb {\n  background-color: var(--em-color-border);\n}\n\n.sticky {\n  z-index: 1;\n  background-color: rgba(var(--em-rgb-background), .9);\n  -webkit-backdrop-filter: blur(4px);\n  backdrop-filter: blur(4px);\n  font-weight: 500;\n  position: sticky;\n  top: -1px;\n}\n\n[dir=\"rtl\"] .search input[type=\"search\"] {\n  padding: 10px 2.2em 10px 2em;\n}\n\n[dir=\"rtl\"] .search .loupe {\n  left: auto;\n  right: .7em;\n}\n\n[dir=\"rtl\"] .search .delete {\n  left: .7em;\n  right: auto;\n}\n\n.search {\n  z-index: 2;\n  position: relative;\n}\n\n.search input, .search button {\n  font-size: calc(var(--font-size)  - 1px);\n}\n\n.search input[type=\"search\"] {\n  width: 100%;\n  background-color: var(--em-color-border);\n  transition-duration: var(--duration);\n  transition-property: background-color, box-shadow;\n  transition-timing-function: var(--easing);\n  border: 0;\n  border-radius: 10px;\n  outline: 0;\n  padding: 10px 2em 10px 2.2em;\n  display: block;\n}\n\n.search input[type=\"search\"]::-ms-input-placeholder {\n  color: inherit;\n  opacity: .6;\n}\n\n.search input[type=\"search\"]::placeholder {\n  color: inherit;\n  opacity: .6;\n}\n\n.search input[type=\"search\"], .search input[type=\"search\"]::-webkit-search-decoration, .search input[type=\"search\"]::-webkit-search-cancel-button, .search input[type=\"search\"]::-webkit-search-results-button, .search input[type=\"search\"]::-webkit-search-results-decoration {\n  -webkit-appearance: none;\n  -ms-appearance: none;\n  appearance: none;\n}\n\n.search input[type=\"search\"]:focus {\n  background-color: rgb(var(--em-rgb-input));\n  box-shadow: inset 0 0 0 1px rgb(var(--em-rgb-accent)), 0 1px 3px rgba(65, 69, 73, .2);\n}\n\n.search .icon {\n  z-index: 1;\n  color: rgba(var(--em-rgb-color), .7);\n  position: absolute;\n  top: 50%;\n  transform: translateY(-50%);\n}\n\n.search .loupe {\n  pointer-events: none;\n  left: .7em;\n}\n\n.search .delete {\n  right: .7em;\n}\n\nsvg {\n  fill: currentColor;\n  width: 1em;\n  height: 1em;\n}\n\nbutton {\n  -webkit-appearance: none;\n  -ms-appearance: none;\n  appearance: none;\n  cursor: pointer;\n  color: currentColor;\n  background-color: rgba(0, 0, 0, 0);\n  border: 0;\n}\n\n#nav {\n  z-index: 2;\n  padding-top: 12px;\n  padding-bottom: 12px;\n  padding-right: var(--sidebar-width);\n  position: relative;\n}\n\n#nav button {\n  color: var(--color-b);\n  transition: color var(--duration) var(--easing);\n}\n\n#nav button:hover {\n  color: var(--color-a);\n}\n\n#nav svg, #nav img {\n  width: var(--category-icon-size);\n  height: var(--category-icon-size);\n}\n\n#nav[dir=\"rtl\"] .bar {\n  left: auto;\n  right: 0;\n}\n\n#nav .bar {\n  width: 100%;\n  height: 3px;\n  background-color: rgb(var(--em-rgb-accent));\n  transition: transform var(--duration) var(--easing);\n  border-radius: 3px 3px 0 0;\n  position: absolute;\n  bottom: -12px;\n  left: 0;\n}\n\n#nav button[aria-selected] {\n  color: rgb(var(--em-rgb-accent));\n}\n\n#preview {\n  z-index: 2;\n  padding: calc(var(--padding)  + 4px) var(--padding);\n  padding-right: var(--sidebar-width);\n  position: relative;\n}\n\n#preview .preview-placeholder {\n  font-size: var(--preview-placeholder-size);\n}\n\n#preview .preview-title {\n  font-size: var(--preview-title-size);\n}\n\n#preview .preview-subtitle {\n  font-size: var(--preview-subtitle-size);\n}\n\n#nav:before, #preview:before {\n  content: \"\";\n  height: 2px;\n  position: absolute;\n  left: 0;\n  right: 0;\n}\n\n#nav[data-position=\"top\"]:before, #preview[data-position=\"top\"]:before {\n  background: linear-gradient(to bottom, var(--em-color-border), transparent);\n  top: 100%;\n}\n\n#nav[data-position=\"bottom\"]:before, #preview[data-position=\"bottom\"]:before {\n  background: linear-gradient(to top, var(--em-color-border), transparent);\n  bottom: 100%;\n}\n\n.category:last-child {\n  min-height: calc(100% + 1px);\n}\n\n.category button {\n  font-family: -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif;\n  position: relative;\n}\n\n.category button > * {\n  position: relative;\n}\n\n.category button .background {\n  opacity: 0;\n  background-color: var(--em-color-border);\n  transition: opacity var(--duration-fast) var(--easing) var(--duration-instant);\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  left: 0;\n  right: 0;\n}\n\n.category button:hover .background {\n  transition-duration: var(--duration-instant);\n  transition-delay: 0s;\n}\n\n.category button[aria-selected] .background {\n  opacity: 1;\n}\n\n.category button[data-keyboard] .background {\n  transition: none;\n}\n\n.row {\n  width: 100%;\n  position: absolute;\n  top: 0;\n  left: 0;\n}\n\n.skin-tone-button {\n  border: 1px solid rgba(0, 0, 0, 0);\n  border-radius: 100%;\n}\n\n.skin-tone-button:hover {\n  border-color: var(--em-color-border);\n}\n\n.skin-tone-button:active .skin-tone {\n  transform: scale(.85) !important;\n}\n\n.skin-tone-button .skin-tone {\n  transition: transform var(--duration) var(--easing);\n}\n\n.skin-tone-button[aria-selected] {\n  background-color: var(--em-color-border);\n  border-top-color: rgba(0, 0, 0, .05);\n  border-bottom-color: rgba(0, 0, 0, 0);\n  border-left-width: 0;\n  border-right-width: 0;\n}\n\n.skin-tone-button[aria-selected] .skin-tone {\n  transform: scale(.9);\n}\n\n.menu {\n  z-index: 2;\n  white-space: nowrap;\n  border: 1px solid var(--em-color-border);\n  background-color: rgba(var(--em-rgb-background), .9);\n  -webkit-backdrop-filter: blur(4px);\n  backdrop-filter: blur(4px);\n  transition-property: opacity, transform;\n  transition-duration: var(--duration);\n  transition-timing-function: var(--easing);\n  border-radius: 10px;\n  padding: 4px;\n  position: absolute;\n  box-shadow: 1px 1px 5px rgba(0, 0, 0, .05);\n}\n\n.menu.hidden {\n  opacity: 0;\n}\n\n.menu[data-position=\"bottom\"] {\n  transform-origin: 100% 100%;\n}\n\n.menu[data-position=\"bottom\"].hidden {\n  transform: scale(.9)rotate(-3deg)translateY(5%);\n}\n\n.menu[data-position=\"top\"] {\n  transform-origin: 100% 0;\n}\n\n.menu[data-position=\"top\"].hidden {\n  transform: scale(.9)rotate(3deg)translateY(-5%);\n}\n\n.menu input[type=\"radio\"] {\n  clip: rect(0 0 0 0);\n  width: 1px;\n  height: 1px;\n  border: 0;\n  margin: 0;\n  padding: 0;\n  position: absolute;\n  overflow: hidden;\n}\n\n.menu input[type=\"radio\"]:checked + .option {\n  box-shadow: 0 0 0 2px rgb(var(--em-rgb-accent));\n}\n\n.option {\n  width: 100%;\n  border-radius: 6px;\n  padding: 4px 6px;\n}\n\n.option:hover {\n  color: #fff;\n  background-color: rgb(var(--em-rgb-accent));\n}\n\n.skin-tone {\n  width: 16px;\n  height: 16px;\n  border-radius: 100%;\n  display: inline-block;\n  position: relative;\n  overflow: hidden;\n}\n\n.skin-tone:after {\n  content: \"\";\n  mix-blend-mode: overlay;\n  background: linear-gradient(rgba(255, 255, 255, .2), rgba(0, 0, 0, 0));\n  border: 1px solid rgba(0, 0, 0, .8);\n  border-radius: 100%;\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  left: 0;\n  right: 0;\n  box-shadow: inset 0 -2px 3px #000, inset 0 1px 2px #fff;\n}\n\n.skin-tone-1 {\n  background-color: #ffc93a;\n}\n\n.skin-tone-2 {\n  background-color: #ffdab7;\n}\n\n.skin-tone-3 {\n  background-color: #e7b98f;\n}\n\n.skin-tone-4 {\n  background-color: #c88c61;\n}\n\n.skin-tone-5 {\n  background-color: #a46134;\n}\n\n.skin-tone-6 {\n  background-color: #5d4437;\n}\n\n[data-index] {\n  justify-content: space-between;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone:after {\n  box-shadow: none;\n  border-color: rgba(0, 0, 0, .5);\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-1 {\n  background-color: #fade72;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-2 {\n  background-color: #f3dfd0;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-3 {\n  background-color: #eed3a8;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-4 {\n  background-color: #cfad8d;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-5 {\n  background-color: #a8805d;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-6 {\n  background-color: #765542;\n}\n\n[data-emoji-set=\"google\"] .skin-tone:after {\n  box-shadow: inset 0 0 2px 2px rgba(0, 0, 0, .4);\n}\n\n[data-emoji-set=\"google\"] .skin-tone-1 {\n  background-color: #f5c748;\n}\n\n[data-emoji-set=\"google\"] .skin-tone-2 {\n  background-color: #f1d5aa;\n}\n\n[data-emoji-set=\"google\"] .skin-tone-3 {\n  background-color: #d4b48d;\n}\n\n[data-emoji-set=\"google\"] .skin-tone-4 {\n  background-color: #aa876b;\n}\n\n[data-emoji-set=\"google\"] .skin-tone-5 {\n  background-color: #916544;\n}\n\n[data-emoji-set=\"google\"] .skin-tone-6 {\n  background-color: #61493f;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone:after {\n  border-color: rgba(0, 0, 0, .4);\n  box-shadow: inset 0 -2px 3px #000, inset 0 1px 4px #fff;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-1 {\n  background-color: #f5c748;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-2 {\n  background-color: #f1d5aa;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-3 {\n  background-color: #d4b48d;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-4 {\n  background-color: #aa876b;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-5 {\n  background-color: #916544;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-6 {\n  background-color: #61493f;\n}\n\n";










export {$efa000751917694d$export$2e2bcd8739ae039 as Picker, $331b4160623139bf$export$2e2bcd8739ae039 as Emoji, $b22cfd0a55410b4f$export$2e2bcd8739ae039 as FrequentlyUsed, $e6eae5155b87f591$export$bcb25aa587e9cb13 as SafeFlags, $c4d155af13ad4d4b$export$2e2bcd8739ae039 as SearchIndex, $f72b75cf796873c7$export$2e2bcd8739ae039 as Store, $7adb23b0109cc36a$export$2cd8252107eb640b as init, $7adb23b0109cc36a$export$2d0294657ab35f1b as Data, $7adb23b0109cc36a$export$dbe3113d60765c1a as I18n, $693b183b0a78708f$export$5ef5574deca44bc0 as getEmojiDataFromNative};
//# sourceMappingURL=module.js.map
