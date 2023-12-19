export default function enable() {
  const ua = window.navigator.userAgent;
  const iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
  const webkit = !!ua.match(/WebKit/i);
  const iOSSafari = iOS && webkit && !ua.match(/CriOS/i);

  if (iOSSafari) {
    window.alert(
      "You are using iOS Safari. Please use Chrome or Firefox for the best experience."
    );
  }
}
