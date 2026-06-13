
// Simulation of Flexa Leveling System
function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100)) + 1;
}

const winXP = 20; // XP per win
const milestones = [1, 5, 20, 50, 100, 500];

console.log("=== Flexa Leveling System Audit ===");
milestones.forEach(wins => {
    const totalXP = wins * winXP;
    const level = calculateLevel(totalXP);
    console.log(`Wins: ${wins} | Total XP: ${totalXP} | Resulting Level: ${level}`);
});
