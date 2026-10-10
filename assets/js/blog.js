console.log("blog.js loaded");
// Random song displayer
const CDS = [
    {
        cd: "images/blog/cd_moonwalkin.png",
        title: "Moonwalkin' - LNGSHOT",
        href: "https://youtu.be/HJgdT15UT4k"
    },
    {
        cd: "images/blog/cd_singasong.png",
        title: "singasong - V8",
        href: "https://youtu.be/pBpr9TnhhkE"
    }
];

(function () {
    const cdLink = document.getElementById("cd-link");
    const songLink = document.getElementById("song-link");
    const disc = document.getElementById("cd-disc");
    console.log(cdLink, songLink, disc);
    if (!cdLink || !songLink || !disc || CDS.length === 0) return;

    const pick = CDS[Math.floor(Math.random() * CDS.length)];

    disc.src = pick.cd;
    songLink.querySelector("strong").textContent = pick.title;
    cdLink.href = pick.href;
    songLink.href = pick.href;
})();