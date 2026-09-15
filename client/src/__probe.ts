import { initAssets, loadRoomAssets, loadSnowcatShapes } from "./pixi/assets";

async function run(): Promise<void> {
  await initAssets();
  const shapes = await loadSnowcatShapes();
  const northpole = await loadRoomAssets("northpole");
  const crashsite = await loadRoomAssets("crashsite");

  const dims = (t: { width: number; height: number }) => [t.width, t.height];
  const result = {
    snowcat: shapes.size,
    snowcatSizes: [...shapes.entries()].map(([id, t]) => [id, ...dims(t)]),
    northpole: northpole.roomId === "northpole" ? dims(northpole.northpole) : northpole.roomId,
    crashsite:
      crashsite.roomId === "crashsite"
        ? {
            crashedBobcat: dims(crashsite.crashedBobcat),
            wave: dims(crashsite.wave),
            bobcatLayer2: dims(crashsite.bobcatLayer2),
          }
        : crashsite.roomId,
  };

  const allShapesOk = shapes.size === 15 && [...shapes.values()].every((t) => t.width > 0 && t.height > 0);
  const roomsOk =
    northpole.roomId === "northpole" &&
    northpole.northpole.width > 0 &&
    crashsite.roomId === "crashsite" &&
    crashsite.crashedBobcat.width > 0 &&
    crashsite.wave.width > 0 &&
    crashsite.bobcatLayer2.width > 0;
  const ok = allShapesOk && roomsOk;

  document.getElementById("result")!.textContent = JSON.stringify({ ok, result });
  document.documentElement.dataset.done = ok ? "ok" : "fail";
}

run().catch((e) => {
  document.getElementById("result")!.textContent = String((e && (e as Error).stack) || e);
  document.documentElement.dataset.done = "error";
});
