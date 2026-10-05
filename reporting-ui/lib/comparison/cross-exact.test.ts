// Verifies Option A: a bare "Crosses" (master) scores EXACT against an
// outcome-tagged "Crosses Successful/Unsuccesful" (analyst) at the same
// time + player. Uses the real comparison engine on synthetic instances.
import { describe, it, expect } from "vitest";
import { compareInstances, type Instance } from "./xml-compare";

function inst(
  id: string,
  start: number,
  stat: string,
  team: string,
  playerNumber: number
): Instance {
  return {
    id,
    start,
    end: start,
    mid: start,
    team,
    playerNumber,
    playerRaw: `#${playerNumber}`,
    stat,
    category: "Passing",
    code: `${team} - #${playerNumber}. x`,
  };
}

describe("bare vs outcome crosses/through balls", () => {
  it("scores a bare master cross as EXACT vs an outcome analyst cross", () => {
    const master = [inst("m1", 100, "Crosses", "Home", 33)];
    const analyst = [inst("a1", 100, "Crosses Unsuccesful", "Home", 33)];
    const res = compareInstances(master, analyst, 3, "Home vs Away");
    expect(res.rows[0].status).toBe("exact");
  });

  it("scores a bare master through ball as EXACT vs an outcome analyst one", () => {
    const master = [inst("m1", 200, "Through Balls", "Home", 10)];
    const analyst = [inst("a1", 200, "Through Balls Successful", "Home", 10)];
    const res = compareInstances(master, analyst, 3, "Home vs Away");
    expect(res.rows[0].status).toBe("exact");
  });

  it("keeps short vs long passes as DIFFERENT (not exact)", () => {
    const master = [inst("m1", 300, "Short Passes Successful", "Home", 7)];
    const analyst = [inst("a1", 300, "Long Passes Successful", "Home", 7)];
    const res = compareInstances(master, analyst, 3, "Home vs Away");
    expect(res.rows[0].status).not.toBe("exact");
  });

  it("pairs SAME player+time across unrelated stats (players-first)", () => {
    // Master "Tackles Successful" vs analyst "Ground Duel Loss" — different
    // actions, but same player (#5) at the same time: must pair as wrong_stat,
    // not drop to missed/extra.
    const master = [inst("m1", 400, "Tackles Successful", "Home", 5)];
    const analyst = [inst("a1", 400, "Ground Duel Losses", "Home", 5)];
    const res = compareInstances(master, analyst, 3, "Home vs Away");
    expect(res.rows[0].status).toBe("wrong_stat");
    expect(res.rows[0].analyst).not.toBeNull();
  });

  it("does NOT pair unrelated stats on DIFFERENT players", () => {
    const master = [inst("m1", 500, "Tackles Successful", "Home", 5)];
    const analyst = [inst("a1", 500, "Ground Duel Losses", "Home", 9)];
    const res = compareInstances(master, analyst, 3, "Home vs Away");
    // Different players + unrelated stats => master is missed (no pairing).
    expect(res.rows[0].status).toBe("missed");
  });
});
