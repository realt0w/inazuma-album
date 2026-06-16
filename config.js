window.INAZUMA_CONFIG = {
  language: "fr",
  apiBaseUrl:
    window.location.hostname === "cross.inazuma-eleven.fr"
      ? "https://api.cross.inazuma-eleven.fr"
      : `http://${window.location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost"}:4000`,
};
