import { buildLocalCommAnalysis } from "../src/utils/localCommParser.runtime.mjs";
const letterPairs = {"UBL":"A","UBR":"B","UFR":"C","UFL":"D","LBU":"E","LFU":"F","LFD":"G","LDB":"H","FUL":"I","FUR":"J","FRD":"K","FDL":"L","RFU":"M","RBU":"N","RBD":"O","RFD":"P","BUR":"Q","BUL":"R","BLD":"S","BRD":"T","DFL":"U","DFR":"V","DBR":"W","DBL":"X","UB":"A","UR":"B","UF":"C","UL":"D","LU":"E","LF":"F","LD":"G","LB":"H","FU":"I","FR":"J","FD":"K","FL":"L","RU":"M","RB":"N","RD":"O","RF":"P","BU":"Q","BL":"R","BD":"S","BR":"T","DF":"U","DR":"V","DB":"W","DL":"X"};
function inv(m){return m.endsWith("2")?m:m.endsWith("'")?m.slice(0,-1):m+"'"}
function invertAlg(a){return a.trim().split(/\s+/).reverse().map(inv).join(" ")}
function run(name, solve){
 const analysis=buildLocalCommAnalysis({SCRAMBLE:invertAlg(solve),SOLVE:solve,CUBE_OREINTATION:"white-green",EDGES_BUFFER:"UF",CORNER_BUFFER:"UFR",LETTER_PAIRS_DICT:JSON.stringify(letterPairs),PARSE_TO_LETTER_PAIR:true,DIFF_BETWEEN_ALGS:0.87});
 console.log("\n==",name,"solved",analysis.solved,"parsed",analysis.parsed,"==");
 console.log(analysis.commStats.map(c=>({phase:c.phase,text:c.parse_text,raw:c.raw_comm, len:c.alg_length,start:c.move_start_index,end:c.move_end_index})));
 console.log("highs", analysis.solveStates.filter(s=>s.diff>.87).map(s=>({count:s.count,move:s.move,diff:s.diff,edges:s.solvedEdges,corners:s.solvedCorners})));
}
const BP="D' R' D R U R' D' R D R' D' R U' R' D R";
const LH="D R U R' D R U' R' D D";
const CB="U R' D R D' R' D R U' R' D' R D R' D' R";
const Tperm="R U R' U' R' F R2 U' R' U' R U R' F'";
const Aperm="x R' U R' D2 R U' R' D2 R2 x'";
const Niklas="R U' L' U R' U' L U";
[BP,CB,Tperm,Aperm,Niklas].forEach((a,i)=>run('single '+i,a));
run('BP+BP', `${BP} ${BP}`);
run('BP+invBP', `${BP} ${invertAlg(BP)}`);
run('T+T', `${Tperm} ${Tperm}`);
run('A+A', `${Aperm} ${Aperm}`);
run('Niklas+Niklas', `${Niklas} ${Niklas}`);
run('BP+T', `${BP} ${Tperm}`);
run('T+BP', `${Tperm} ${BP}`);
run('BP+LH', `${BP} ${LH}`);
run('LH+BP', `${LH} ${BP}`);
