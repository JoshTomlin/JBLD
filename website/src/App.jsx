import React from "react";
import cubeSolver from "cube-solver";
import { connectGanCube } from "gan-web-bluetooth";
import Setting from "./component/Settings";
import "bootstrap/dist/css/bootstrap.css";
import Timer from "./component/Timer";
import { Helmet } from "react-helmet";
import { buildSolveAnalysis } from "./utils/bldParser";
import { buildLocalSolveResult } from "./utils/localSolveParser";
import { computeSessionAggregateStats } from "./utils/solveAverages";
import { extractRecordedSolveData } from "./utils/extractRecordedSolve";
import {
  fetchSupabaseDataset,
  fetchSupabaseSolveById,
  isSupabaseConfigured,
  syncSupabaseDataset,
} from "./utils/supabaseSync";

import LZString from "lz-string";
import "react-base-table/styles.css";

class App extends React.Component {
  constructor() {
    super();
    this.GiikerCube = this.GiikerCube.bind(this);
    this.connectGanCubeDirect = this.connectGanCubeDirect.bind(this);
    this.newMovesNotation = this.newMovesNotation.bind(this);
    this.deferredInstallPrompt = null;
    this.state = {
      activeView: "solve",
      showMenu: false,
      showSettings: false,
      showLastSolveDetails: false,
      loadingSolveDetails: false,
      gan: false,
      sessions: [],
      activeSessionId: null,
      historySessionMenuOpen: false,
      url_stats: "",
      averages: {
        best: { time: 10000, solve: {} },
        current: "",
        mo3: "",
        ao5: "",
        ao12: "",
        bmo3: { time: 10000, solves: {}, num: 0 },
        bao5: { time: 10000, solves: {}, num: 0 },
        bao12: { time: 10000, solves: {}, num: 0 },
        aoAll: "",
        memo: "",
        exe: "",
        fluid: "",
        success: "",
      },
      local_storage_setting: null,
      renderTable: null,
      solves_stats: [],
      timer_focus: null,
      moves_to_show: null,
      giiker_prev_moves: [],
      solve_status: "Connect Cube",
      last_scramble: null,
      scramble: null,
      parse_solve_bool: false,
      cube_moves: [],
      cube_moves_time: [],
      cube: null,
      connectionNotice: null,
      remoteParserAvailable: null,
      installPromptAvailable: false,
      installStatusMessage: null,
      isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
      isInstalled:
        typeof window !== "undefined" &&
        (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true),
      generated_setting: "",
      timeStart: null,
      timeFinish: null,
      parsed_solve: null,
      parsed_solve_txt: null,
      parsed_solve_cubedb: null,
      selectedSolveDetails: null,
      parse_settings:
        localStorage.getItem("setting") === null
          ? {
              ID: this.makeid(10),
              DATE_SOLVE: "9/18/2021, 12:22 AM",
              DIFF_BETWEEN_ALGS: "0.87",
              MEMO: "1.39",
              TIME_SOLVE: "30.48",
              NAME_OF_SOLVE: "example_smart_cube",
              GEN_PARSED_TO_CUBEDB: true,
              GEN_PARSED_TO_TXT: true,
              SMART_CUBE: false,
              COMMS_UNPARSED: false,
              EDGES_BUFFER: "UF",
              CORNER_BUFFER: "UFR",
              CUBE_OREINTATION: "yellow-green",
              SCRAMBLE_TYPE: "3x3",
              PARSE_TO_LETTER_PAIR: true,
              GEN_WITH_MOVE_COUNT: true,
              LETTER_PAIRS_DICT:
                '{"UBL":"A","UBR":"B","UFR":"C","UFL":"D","LBU":"E","LFU":"F","LFD":"G","LDB":"H","FUL":"I","FUR":"J","FRD":"K","FDL":"L","RFU":"M","RBU":"N","RBD":"O","RFD":"P","BUR":"Q","BUL":"R","BLD":"S","BRD":"T","DFL":"U","DFR":"V","DBR":"W","DBL":"X","UB":"A","UR":"B","UF":"C","UL":"D","LU":"E","LF":"F","LD":"G","LB":"H","FU":"I","FR":"J","FD":"K","FL":"L","RU":"M","RB":"N","RD":"O","RF":"P","BU":"Q","BL":"R","BD":"S","BR":"T","DF":"U","DR":"V","DB":"W","DL":"X"}',
              SCRAMBLE:
                "F' R' B' D L' B' B' D' D' L' U B' R R F' R R B D' D' B U U L L U U L L B' R' U'",
              SOLVE:
                "R F' L' F R' L D' L D L' U' U' L' R B R B' R' L U R' U R' R' U D' F U' F' U' D R U R R' F' L F L' R U' L' U L R' R' U' R U' D B' B' U D' R U R R F' R' U D' F F D U' R' F R' D D U R U' R' D D R U R' U' R R U R' D' R' D R U U R' D' R U D U R U U' U' R' D R R U R' R' U' R R D' R' R' U R R U' R' R' R D' R' D R U R' D' R U' D R'",
              SOLVE_TIME_MOVES: [],
            }
          : JSON.parse(localStorage.getItem("setting")),
    };
  }

  componentDidMount = () => {
    this.initialStatsFromLocalstorage();
    this.handle_scramble();
    window.addEventListener("online", this.handleNetworkChange);
    window.addEventListener("offline", this.handleNetworkChange);
    window.addEventListener("beforeinstallprompt", this.handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", this.handleAppInstalled);
    this.probeRemoteParserAvailability();
    this.syncSessionsWithCloud().catch((error) => {
      console.warn("Cloud sync bootstrapping failed, using local cache", error);
    });
  };
  componentWillUnmount = () => {
    window.removeEventListener("online", this.handleNetworkChange);
    window.removeEventListener("offline", this.handleNetworkChange);
    window.removeEventListener("beforeinstallprompt", this.handleBeforeInstallPrompt);
    window.removeEventListener("appinstalled", this.handleAppInstalled);
  };
  handleNetworkChange = () => {
    const isOffline = !navigator.onLine;
    this.setState({ isOffline });
    if (!isOffline) {
      this.syncSessionsWithCloud().catch((error) => {
        console.warn("Cloud sync after reconnect failed", error);
      });
    }
  };
  handleBeforeInstallPrompt = (event) => {
    event.preventDefault();
    this.deferredInstallPrompt = event;
    this.setState({
      installPromptAvailable: true,
      installStatusMessage: "Install JBLD to keep it on your phone for offline practice.",
    });
  };
  handleAppInstalled = () => {
    this.deferredInstallPrompt = null;
    this.setState({
      installPromptAvailable: false,
      isInstalled: true,
      installStatusMessage: "JBLD is installed. Open it from your home screen for local use.",
    });
  };
  promptInstall = async () => {
    if (!this.deferredInstallPrompt) {
      this.setState({
        installStatusMessage:
          "Use your browser menu and choose Add to Home Screen if the install button is unavailable.",
      });
      return;
    }

    this.deferredInstallPrompt.prompt();
    const choiceResult = await this.deferredInstallPrompt.userChoice;
    this.deferredInstallPrompt = null;
    this.setState({
      installPromptAvailable: false,
      installStatusMessage:
        choiceResult && choiceResult.outcome === "accepted"
          ? "Install accepted. JBLD should appear on your home screen shortly."
          : "Install was dismissed. You can trigger it again later from the browser menu.",
    });
  };
  handleMenuInstall = () => {
    this.setState({ showMenu: false }, () => {
      this.promptInstall();
    });
  };
  dismissConnectionNotice = () => {
    this.setState({ connectionNotice: null });
  };
  probeRemoteParserAvailability = async () => {
    try {
      const response = await fetch(`${this.getApiOrigin()}/options`, {
        method: "OPTIONS",
        headers: {
          Accept: "application/json",
        },
      });
      const remoteParserAvailable = response.ok;
      this.setState({ remoteParserAvailable });
      if (remoteParserAvailable) {
        this.syncSessionsFromServer();
      }
    } catch (error) {
      console.warn("Remote parser probe failed, using local mode", error);
      this.setState({ remoteParserAvailable: false });
    }
  };
  parseJsonStorage = (key, fallbackValue) => {
    try {
      const rawValue = localStorage.getItem(key);
      return rawValue === null ? fallbackValue : JSON.parse(rawValue);
    } catch (error) {
      console.warn(`Failed to parse localStorage key "${key}"`, error);
      return fallbackValue;
    }
  };

  buildSessionRecord = (name, solves = []) => {
    const timestamp = Date.now();
    return {
      id: `session-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      solves,
    };
  };

  getActiveSessionFromList = (sessions, activeSessionId) => {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return null;
    }
    return sessions.find((session) => session.id === activeSessionId) || sessions[0];
  };

  persistSessionStorage = (sessions, activeSessionId) => {
    const activeSession = this.getActiveSessionFromList(sessions, activeSessionId);
    const solves = activeSession && Array.isArray(activeSession.solves) ? activeSession.solves : [];

    localStorage.setItem("sessions", JSON.stringify(sessions));
    localStorage.setItem("activeSessionId", JSON.stringify(activeSession ? activeSession.id : null));
    localStorage.setItem("solves", JSON.stringify(solves));
  };

  ensureSessionStorage = () => {
    let sessions = this.parseJsonStorage("sessions", []);
    let activeSessionId = this.parseJsonStorage("activeSessionId", null);

    if (!Array.isArray(sessions)) {
      sessions = [];
    }

    sessions = sessions
      .filter(Boolean)
      .map((session, index) => ({
        id: session.id || `session-restored-${index}`,
        name: session.name || `Session ${index + 1}`,
        createdAt: session.createdAt || Date.now(),
        updatedAt: session.updatedAt || session.createdAt || Date.now(),
        solves: Array.isArray(session.solves) ? session.solves : [],
      }));

    if (sessions.length === 0) {
      const legacySolves = this.parseJsonStorage("solves", []);
      const initialSession = this.buildSessionRecord(
        legacySolves.length > 0 ? "Imported Session" : "Session 1",
        Array.isArray(legacySolves) ? legacySolves : []
      );
      sessions = [initialSession];
      activeSessionId = initialSession.id;
    }

    const activeSession = this.getActiveSessionFromList(sessions, activeSessionId);
    const resolvedActiveSessionId = activeSession ? activeSession.id : sessions[0].id;

    this.persistSessionStorage(sessions, resolvedActiveSessionId);

    return {
      sessions,
      activeSessionId: resolvedActiveSessionId,
      activeSession: this.getActiveSessionFromList(sessions, resolvedActiveSessionId),
    };
  };

  updateParseSettings = (updates) => {
    this.setState((prevState) => {
      const parse_settings = {
        ...prevState.parse_settings,
        ...updates,
      };
      localStorage.setItem("setting", JSON.stringify(parse_settings));
      return { parse_settings };
    });
  };

  getApiOrigin = () =>
    window.location.port === "8080"
      ? `${window.location.protocol}//${window.location.hostname}:8082`
      : "";

  hasCloudSync = () => isSupabaseConfigured();

  buildSolveId = () => `solve-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  apiRequest = async (path, options = {}) => {
    const response = await fetch(`${this.getApiOrigin()}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const rawBody = await response.text();
    const data = rawBody ? JSON.parse(rawBody) : null;

    if (!response.ok) {
      throw new Error(
        data && data.details ? data.details : data && data.error ? data.error : `Request failed with status ${response.status}`
      );
    }

    return data;
  };

  mergeSessions = (localSessions, cloudSessions) => {
    const bySessionId = new Map();

    [...(Array.isArray(localSessions) ? localSessions : []), ...(Array.isArray(cloudSessions) ? cloudSessions : [])].forEach(
      (session) => {
        if (!session || !session.id) {
          return;
        }

        const existing = bySessionId.get(session.id);
        const solvesById = new Map();

        [...(existing && Array.isArray(existing.solves) ? existing.solves : []), ...(Array.isArray(session.solves) ? session.solves : [])].forEach(
          (solve) => {
            if (!solve) {
              return;
            }

            const solveId = solve.id || this.buildSolveId();
            const current = solvesById.get(solveId);
            const currentUpdated = current ? current.updatedAt || current.date || 0 : 0;
            const nextUpdated = solve.updatedAt || solve.date || 0;

            if (!current || nextUpdated >= currentUpdated) {
              solvesById.set(solveId, { ...solve, id: solveId });
            }
          }
        );

        const existingUpdated = existing ? existing.updatedAt || existing.createdAt || 0 : 0;
        const nextUpdated = session.updatedAt || session.createdAt || 0;
        const baseSession = !existing || nextUpdated >= existingUpdated ? session : existing;

        bySessionId.set(session.id, {
          ...baseSession,
          solves: [...solvesById.values()].sort((a, b) => (a.date || 0) - (b.date || 0)),
          createdAt:
            (existing && existing.createdAt) || session.createdAt || Date.now(),
          updatedAt: Math.max(existingUpdated, nextUpdated) || Date.now(),
        });
      }
    );

    return [...bySessionId.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  };

  syncSessionsWithCloud = async (preferredActiveSessionId = null) => {
    if (!this.hasCloudSync() || (typeof navigator !== "undefined" && !navigator.onLine)) {
      return;
    }

    const userId = this.state.parse_settings && this.state.parse_settings.ID;
    if (!userId) {
      return;
    }

    const { sessions, activeSessionId } = this.ensureSessionStorage();
    const cloudSessions = await fetchSupabaseDataset(userId);
    const mergedSessions = this.mergeSessions(sessions, cloudSessions);
    const nextActiveSessionId = preferredActiveSessionId || activeSessionId || (mergedSessions[0] && mergedSessions[0].id);

    this.persistSessionStorage(mergedSessions, nextActiveSessionId);
    this.setState(
      {
        sessions: mergedSessions,
        activeSessionId: nextActiveSessionId,
      },
      this.initialStatsFromLocalstorage
    );

    await syncSupabaseDataset(userId, mergedSessions);
  };

  normalizeServerSolve = (solve) => ({
    ...solve,
    date: solve && solve.date ? new Date(solve.date).getTime() : Date.now(),
  });

  normalizeServerSession = (session) => ({
    id: session.id,
    name: session.name,
    puzzleType: session.puzzle_type,
    scrambleType: session.scramble_type,
    createdAt: session.created_at ? new Date(session.created_at).getTime() : Date.now(),
    updatedAt: session.updated_at ? new Date(session.updated_at).getTime() : Date.now(),
    solves: Array.isArray(session.solves) ? session.solves.map(this.normalizeServerSolve) : [],
  });

  isServerSessionId = (sessionId) => {
    if (typeof sessionId === "number") {
      return Number.isFinite(sessionId);
    }

    if (typeof sessionId === "string") {
      return /^\d+$/.test(sessionId);
    }

    return false;
  };

  applyServerSessions = (serverSessions, preferredActiveSessionId = null) => {
    const normalizedSessions = Array.isArray(serverSessions)
      ? serverSessions.map(this.normalizeServerSession)
      : [];

    if (normalizedSessions.length === 0) {
      return;
    }

    const preferredId =
      preferredActiveSessionId ||
      this.state.activeSessionId ||
      normalizedSessions[0].id;

    const activeSession =
      normalizedSessions.find((session) => session.id === preferredId) || normalizedSessions[0];

    this.persistSessionStorage(normalizedSessions, activeSession.id);
    this.setState(
      {
        sessions: normalizedSessions,
        activeSessionId: activeSession.id,
      },
      this.initialStatsFromLocalstorage
    );
  };

  syncSessionsFromServer = async () => {
    if (this.hasCloudSync()) {
      await this.syncSessionsWithCloud();
      return;
    }

    if (this.state.remoteParserAvailable === false) {
      return;
    }
    const userId = this.state.parse_settings && this.state.parse_settings.ID;
    if (!userId) {
      return;
    }

    try {
      const data = await this.apiRequest(`/api/sessions?user_id=${encodeURIComponent(userId)}`, {
        method: "GET",
      });
      if (data && Array.isArray(data.sessions)) {
        this.applyServerSessions(data.sessions);
      }
    } catch (error) {
      console.warn("Failed to sync sessions from server, using local cache", error);
    }
  };

  fetchSolveDetails = async (solveId) => {
    const userId = this.state.parse_settings && this.state.parse_settings.ID;

    if (this.hasCloudSync()) {
      if (!userId || !solveId) {
        return null;
      }
      return fetchSupabaseSolveById(userId, solveId);
    }

    if (this.state.remoteParserAvailable === false) {
      return null;
    }
    if (!userId || !solveId) {
      return null;
    }

    const data = await this.apiRequest(
      `/api/solves/${encodeURIComponent(solveId)}?user_id=${encodeURIComponent(userId)}`,
      { method: "GET" }
    );
    return data && data.solve ? this.normalizeServerSolve(data.solve) : null;
  };

  openSolveDetails = (solve) => {
    this.setState({
      showLastSolveDetails: true,
      historySessionMenuOpen: false,
      loadingSolveDetails: Boolean(solve && solve.id),
      selectedSolveDetails: solve || null,
      parsed_solve_txt: (solve && solve.txt_solve) || "No parsed solve text available yet.",
    });

    if (!solve || !solve.id) {
      return;
    }

    this.fetchSolveDetails(solve.id)
      .then((detailedSolve) => {
        if (!detailedSolve) {
          return;
        }

        this.setState({
          selectedSolveDetails: detailedSolve,
          parsed_solve_txt: detailedSolve.txt_solve || "No parsed solve text available yet.",
          loadingSolveDetails: false,
        });
      })
      .catch((error) => {
        console.warn("Failed to load solve details from server", error);
        this.setState({ loadingSolveDetails: false });
      });
  };

  createSessionOnServer = async (name) => {
    if (this.hasCloudSync()) {
      return this.buildSessionRecord(name);
    }

    if (this.state.remoteParserAvailable === false) {
      return null;
    }
    const payload = {
      user_id: this.state.parse_settings.ID,
      name,
      puzzle_type: "3x3 BLD",
      scramble_type: this.state.parse_settings.SCRAMBLE_TYPE || "3x3",
    };

    const data = await this.apiRequest("/api/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return data && data.session ? this.normalizeServerSession(data.session) : null;
  };

  setSmartCubeConnection = ({ connected, cube = null, gan = connected, connectionNotice = null }) => {
    this.updateParseSettings({ SMART_CUBE: connected });
    this.setState({
      cube,
      gan,
      connectionNotice,
    });
  };

  updateActiveSessionSolves = (updater) => {
    const { sessions, activeSessionId } = this.ensureSessionStorage();
    const nextSessions = sessions.map((session) => {
      if (session.id !== activeSessionId) {
        return session;
      }

      const currentSolves = Array.isArray(session.solves) ? [...session.solves] : [];
      const nextSolves = updater(currentSolves);
      return {
        ...session,
        solves: nextSolves,
        updatedAt: Date.now(),
      };
    });

    this.persistSessionStorage(nextSessions, activeSessionId);
    this.setState({ sessions: nextSessions, activeSessionId }, this.initialStatsFromLocalstorage);
  };

  activateSession = (sessionId) => {
    const { sessions } = this.ensureSessionStorage();
    const activeSession = this.getActiveSessionFromList(sessions, sessionId);

    if (!activeSession) {
      return;
    }

    this.persistSessionStorage(sessions, activeSession.id);
    this.setState(
      {
        sessions,
        activeSessionId: activeSession.id,
      },
      this.initialStatsFromLocalstorage
    );
  };

  startNewSession = () => {
    const { sessions } = this.ensureSessionStorage();
    const nextSessionName = `Session ${sessions.length + 1}`;

    this.createSessionOnServer(nextSessionName)
      .then((serverSession) => {
        if (!serverSession) {
          throw new Error("Session API returned no session");
        }

        const nextSessions = [...sessions, serverSession];
        this.persistSessionStorage(nextSessions, serverSession.id);
        this.setState(
          {
            activeView: "solve",
            sessions: nextSessions,
            activeSessionId: serverSession.id,
          },
          () => {
            this.initialStatsFromLocalstorage();
            this.handle_scramble();
            if (this.hasCloudSync()) {
              this.syncSessionsWithCloud(serverSession.id).catch((error) => {
                console.warn("Cloud sync after session creation failed", error);
              });
            }
          }
        );
      })
      .catch((error) => {
        console.warn("Falling back to local-only session creation", error);
        const nextSession = this.buildSessionRecord(nextSessionName);
        const nextSessions = [...sessions, nextSession];

        this.persistSessionStorage(nextSessions, nextSession.id);
        this.setState(
          {
            activeView: "solve",
            sessions: nextSessions,
            activeSessionId: nextSession.id,
          },
          () => {
            this.initialStatsFromLocalstorage();
            this.handle_scramble();
          }
        );
      });
  };

  getSessionSummary = (session) => {
    const solves = Array.isArray(session && session.solves) ? session.solves : [];
    const completed = solves.filter(({ DNF }) => !DNF);
    const validTimes = solves
      .filter(({ DNF, time_solve }) => !DNF && Number.isFinite(parseFloat(time_solve)))
      .map(({ time_solve }) => parseFloat(time_solve));

    return {
      count: solves.length,
      latest: solves.length ? solves[solves.length - 1] : null,
      bestSingle: validTimes.length ? Math.min(...validTimes) : null,
      successText: solves.length ? `${completed.length}/${solves.length}` : "--",
    };
  };

  extractSolveMetricsFromText = (solveTxt) => {
    if (!solveTxt) {
      return {};
    }

    const firstLine = solveTxt.split("\n")[0] || "";
    const timeMatches = firstLine.match(/[0-9]+:?[0-9]*\.[0-9]*/g) || [];

    return {
      isDnf: firstLine.toLowerCase().includes("dnf"),
      time_solve: timeMatches[0] ? this.convert_time_to_sec(timeMatches[0]) : null,
      memo_time: timeMatches[1] ? this.convert_time_to_sec(timeMatches[1]) : null,
      exe_time: timeMatches[2] ? this.convert_time_to_sec(timeMatches[2]) : null,
      fluidness: timeMatches[3] ? parseFloat(timeMatches[3]) : null,
    };
  };

  buildFallbackSolveText = (setting, parseError) => {
    const totalTime = this.convert_sec_to_format(parseFloat(setting.TIME_SOLVE || 0));
    const memoTime = this.convert_sec_to_format(parseFloat(setting.MEMO || 0));
    const execTime = this.convert_sec_to_format(
      Math.max(parseFloat(setting.TIME_SOLVE || 0) - parseFloat(setting.MEMO || 0), 0)
    );

    return [
      `Unparsed solve ${totalTime}(${memoTime},${execTime})`,
      parseError ? `Parse error: ${parseError}` : "Solve saved without parsed reconstruction.",
      `Scramble: ${setting.SCRAMBLE || ""}`,
      `Solve: ${setting.SOLVE || ""}`,
    ].join("\n");
  };

  formatCommToken = (comm) => {
    if (!comm) {
      return null;
    }

    if (comm.parse_text) {
      return comm.parse_text;
    }

    if (comm.phase === "parity" || comm.special_type === "parity") {
      const parityTarget = comm.parity_target || comm.target_b || comm.target_a;
      return parityTarget ? `${parityTarget} Parity` : "Parity";
    }

    if (comm.special_type === "flip") {
      return `${[comm.target_a, comm.target_b].filter(Boolean).join("")} flip`.trim();
    }

    if (comm.special_type === "rotation" || comm.special_type === "twist") {
      return `${[comm.target_a, comm.target_b].filter(Boolean).join("")} rotation`.trim();
    }

    return [comm.target_a, comm.target_b].filter(Boolean).join("");
  };

  compactRepeatedTurns = (algText) => {
    if (!algText) {
      return "";
    }

    const tokens = String(algText).trim().split(/\s+/).filter(Boolean);
    const compacted = [];
    const getTurnParts = (token) => {
      const match = token.match(/^(.+?)(2|')?$/);
      if (!match || match[2] === "2") {
        return null;
      }
      return {
        base: match[1],
        suffix: match[2] || "",
      };
    };

    for (let index = 0; index < tokens.length; index += 1) {
      const current = getTurnParts(tokens[index]);
      const next = getTurnParts(tokens[index + 1]);

      if (
        current &&
        next &&
        current.base === next.base &&
        current.suffix === next.suffix
      ) {
        compacted.push(`${current.base}2`);
        index += 1;
      } else {
        compacted.push(tokens[index]);
      }
    }

    return compacted.join(" ");
  };

  groupCommBreakdown = (commStats = []) => {
    return commStats.reduce(
      (groups, comm) => {
        const token = this.formatCommToken(comm);
        if (comm.phase === "edge") {
          if (token) {
            groups.edges.push(token);
          }
        } else if (comm.phase === "corner") {
          if (token) {
            groups.corners.push(token);
          }
        } else if (comm.phase === "parity") {
          if (token) {
            groups.parity.push(token);
          }
        }
        return groups;
      },
      { edges: [], corners: [], parity: [] }
    );
  };

  formatSolveResultLabel = (solve) => {
    if (!solve) {
      return "--";
    }
    if (solve.DNF) {
      return `DNF (${this.convert_sec_to_format(solve.time_solve)})`;
    }
    return this.convert_sec_to_format(solve.time_solve);
  };

  getTimerDisplayMs = (latestSolve) => {
    if (
      Number.isFinite(this.state.timeStart) &&
      Number.isFinite(this.state.timeFinish) &&
      this.state.timeFinish > this.state.timeStart
    ) {
      return this.state.timeFinish - this.state.timeStart;
    }

    const latestTime = latestSolve ? parseFloat(latestSolve.time_solve) : NaN;
    return Number.isFinite(latestTime) ? Math.round(latestTime * 1000) : 0;
  };

  getLatestSolveCommLines = (solve) => {
    if (!solve || !Array.isArray(solve.comm_stats)) {
      return [];
    }

    const groups = this.groupCommBreakdown(solve.comm_stats);
    const lines = [];

    if (groups.edges.length) {
      lines.push({ label: "Edges", value: groups.edges.join(", ") });
    }
    if (groups.corners.length) {
      lines.push({ label: "Corners", value: groups.corners.join(", ") });
    }
    if (groups.parity.length) {
      lines.push({ label: "Parity", value: groups.parity.join(", ") });
    }

    return lines;
  };

  formatCommElapsedTime = (solve, comms) => {
    if (!solve || !Array.isArray(comms) || !comms.length) {
      return null;
    }

    const timedOffsets =
      Array.isArray(solve.move_timeline) && solve.move_timeline.length
        ? solve.move_timeline
            .map((move) => (Number.isFinite(move.time_offset) ? move.time_offset : null))
            .filter((value) => value !== null)
        : [];

    if (!timedOffsets.length) {
      return null;
    }

    const lastMoveOffset = timedOffsets[timedOffsets.length - 1];
    let previousOffset = 0;
    let total = 0;

    comms.forEach((comm) => {
      const endIndex = Number(comm.move_end_index);
      const moveOffset =
        Number.isFinite(endIndex) && endIndex > 0 && endIndex <= timedOffsets.length
          ? timedOffsets[endIndex - 1]
          : null;

      if (moveOffset !== null) {
        total += Math.max(moveOffset - previousOffset, 0);
        previousOffset = moveOffset;
      }
    });

    if (!total && lastMoveOffset) {
      total = lastMoveOffset;
    }

    return total ? this.formatInlineDuration(total) : null;
  };

  getTimedMoveOffsets = (solve) =>
    Array.isArray(solve && solve.move_timeline)
      ? solve.move_timeline
          .map((move) => (Number.isFinite(move.time_offset) ? move.time_offset : null))
          .filter((value) => value !== null)
      : [];

  getCommBoundary = (comm, fallbackStart) => {
    const start = Number(comm && comm.move_start_index);
    const end = Number(comm && comm.move_end_index);
    const length = Number(comm && (comm.alg_length || comm.moveCount));
    const resolvedEnd = Number.isFinite(end) && end > 0
      ? end
      : Number.isFinite(fallbackStart) && Number.isFinite(length)
        ? fallbackStart + length - 1
        : null;
    const resolvedStart = Number.isFinite(start) && start > 0
      ? start
      : Number.isFinite(resolvedEnd) && Number.isFinite(length)
        ? Math.max(resolvedEnd - length + 1, 1)
        : fallbackStart;

    return {
      start: Number.isFinite(resolvedStart) ? resolvedStart : null,
      end: Number.isFinite(resolvedEnd) ? resolvedEnd : null,
    };
  };

  getCommSpanSeconds = (solve, comms) => {
    const offsets = this.getTimedMoveOffsets(solve);
    if (!offsets.length || !Array.isArray(comms) || !comms.length) {
      return null;
    }

    let fallbackStart = 1;
    const boundaries = comms
      .map((comm) => {
        const boundary = this.getCommBoundary(comm, fallbackStart);
        if (boundary.end !== null) {
          fallbackStart = boundary.end + 1;
        }
        return boundary;
      })
      .filter(({ start, end }) => start !== null && end !== null);

    if (!boundaries.length) {
      return null;
    }

    const startIndex = Math.min(...boundaries.map(({ start }) => start));
    const endIndex = Math.max(...boundaries.map(({ end }) => end));
    const startOffset = offsets[Math.max(startIndex - 1, 0)];
    const endOffset = offsets[Math.max(endIndex - 1, 0)];

    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
      return null;
    }

    return Math.max(endOffset - startOffset, 0);
  };

  getCommDurationSeconds = (solve, comm, previousEndIndex = 0) => {
    if (comm && comm.exec_time !== null && comm.exec_time !== undefined && Number.isFinite(Number(comm.exec_time))) {
      return Number(comm.exec_time);
    }
    if (comm && comm.alg_time !== null && comm.alg_time !== undefined && Number.isFinite(Number(comm.alg_time))) {
      return Number(comm.alg_time);
    }

    const offsets = this.getTimedMoveOffsets(solve);
    if (!offsets.length) {
      return null;
    }

    const boundary = this.getCommBoundary(comm, previousEndIndex + 1);
    if (boundary.end === null) {
      return null;
    }

    const startOffset =
      boundary.start !== null && boundary.start > 1
        ? offsets[boundary.start - 2]
        : 0;
    const endOffset = offsets[boundary.end - 1];

    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
      return null;
    }

    return Math.max(endOffset - startOffset, 0);
  };

  formatCommSummaryToken = (comm) => {
    const token = this.formatCommToken(comm);
    if (!token) {
      return "";
    }

    return token
      .replace(/\s+rotation$/i, "")
      .replace(/\s+twist$/i, "-Twist")
      .replace(/\s+flip$/i, "-Flip")
      .replace(/\s+parity$/i, "-Parity");
  };

  formatDateLine = (dateValue) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return "--";
    }

    return date.toLocaleString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  getSolveDisplayNumber = (solve, solves) => {
    if (!solve || !Array.isArray(solves) || !solves.length) {
      return "--";
    }

    const index = solves.findIndex(
      (entry) =>
        (solve.id && entry.id === solve.id) ||
        (solve.date && entry.date === solve.date)
    );

    return index >= 0 ? index + 1 : "--";
  };

  getSolveDetailsViewData = (solve, solves) => {
    if (!solve) {
      return null;
    }

    const commStats = Array.isArray(solve.comm_stats) ? solve.comm_stats : [];
    const edgeComms = commStats.filter((comm) => comm.phase === "edge");
    const cornerComms = commStats.filter((comm) => comm.phase === "corner");
    const parityComms = commStats.filter((comm) => comm.phase === "parity");
    const cornerSummaryComms = [...cornerComms, ...parityComms];
    const edgeSpan = this.getCommSpanSeconds(solve, edgeComms);
    const cornerSpan = this.getCommSpanSeconds(solve, cornerSummaryComms);
    const solveNumber = this.getSolveDisplayNumber(solve, solves);
    const formatSummary = (comms, span) => {
      if (!comms.length) {
        return "--";
      }

      const tokens = comms.map(this.formatCommSummaryToken).filter(Boolean).join(" ");
      return `${tokens}${Number.isFinite(span) ? ` (${this.formatInlineDuration(span)})` : ""}`;
    };

    let previousEndIndex = 0;
    const reconstructionRows = commStats.map((comm) => {
      const boundary = this.getCommBoundary(comm, previousEndIndex + 1);
      const duration = this.getCommDurationSeconds(solve, comm, previousEndIndex);
      if (boundary.end !== null) {
        previousEndIndex = boundary.end;
      }

      return {
        ...comm,
        label: this.formatCommSummaryToken(comm),
        duration,
      };
    });

    const lastEdge = edgeComms[edgeComms.length - 1];
    const firstCorner = cornerSummaryComms[0];
    const lastEdgeBoundary = lastEdge ? this.getCommBoundary(lastEdge, null) : null;
    const firstCornerBoundary = firstCorner ? this.getCommBoundary(firstCorner, null) : null;
    const offsets = this.getTimedMoveOffsets(solve);
    const transitionSeconds =
      lastEdgeBoundary &&
      firstCornerBoundary &&
      lastEdgeBoundary.end !== null &&
      firstCornerBoundary.start !== null &&
      offsets[lastEdgeBoundary.end - 1] !== undefined &&
      offsets[firstCornerBoundary.start - 1] !== undefined
        ? Math.max(offsets[firstCornerBoundary.start - 1] - offsets[lastEdgeBoundary.end - 1], 0)
        : null;

    return {
      title: `Solve ${solveNumber}${solve.DNF ? " (DNF)" : ""}`,
      date: this.formatDateLine(solve.date),
      metrics: [
        { label: "Total", value: this.formatSolveResultLabel(solve) },
        { label: "Memo", value: this.convert_sec_to_format(solve.memo_time) },
        { label: "Exec", value: this.convert_sec_to_format(solve.exe_time) },
        { label: "Algs", value: String(commStats.length) },
      ],
      edgeSummary: formatSummary(edgeComms, edgeSpan),
      cornerSummary: formatSummary(cornerSummaryComms, cornerSpan),
      edgeRows: reconstructionRows.filter((comm) => comm.phase === "edge"),
      cornerRows: reconstructionRows.filter((comm) => comm.phase === "corner" || comm.phase === "parity"),
      transitionSeconds,
      link: solve.link || null,
    };
  };

  formatInlineDuration = (seconds) => {
    const value = Number(seconds);
    if (!Number.isFinite(value)) {
      return null;
    }

    if (value >= 60) {
      const minutes = Math.floor(value / 60);
      const remainder = (value - minutes * 60).toFixed(1).padStart(4, "0");
      return `${minutes}:${remainder}`;
    }

    return Number(value.toFixed(1)).toString();
  };

  getLastSolvePanelData = (solve) => {
    if (!solve) {
      return {
        metrics: [],
        lines: [],
      };
    }

    const commStats = Array.isArray(solve.comm_stats) ? solve.comm_stats : [];
    const groups = this.groupCommBreakdown(commStats);
    const edgeComms = commStats.filter((comm) => comm.phase === "edge");
    const cornerComms = commStats.filter((comm) => comm.phase === "corner" || comm.phase === "parity");
    const edgeTime = this.formatCommElapsedTime(solve, edgeComms);
    const cornerTime = this.formatCommElapsedTime(solve, cornerComms);
    const uncertain = Boolean(solve.parseError);
    const edgeSummary = groups.edges.length
      ? `${groups.edges.join(", ")}${edgeTime ? ` (${edgeTime})` : ""}${uncertain ? " ?" : ""}`
      : "--";
    const cornerTokens = [...groups.corners, ...groups.parity];
    const cornerSummary = cornerTokens.length
      ? `${cornerTokens.join(", ")}${cornerTime ? ` (${cornerTime})` : ""}${uncertain ? " ?" : ""}`
      : "--";

    return {
      metrics: [
        { label: "Total", value: this.formatSolveResultLabel(solve) },
        { label: "Memo", value: this.convert_sec_to_format(solve.memo_time) },
        { label: "Exec", value: this.convert_sec_to_format(solve.exe_time) },
        { label: "Algs", value: String(groups.edges.length + groups.corners.length + groups.parity.length) },
      ],
      lines: [
        { label: "Edges", value: edgeSummary },
        { label: "Corners", value: cornerSummary },
      ],
    };
  };

  getLastSolveEventLabel = (solve) => {
    if (!solve || !Array.isArray(solve.comm_stats) || !solve.comm_stats.length) {
      return null;
    }

    return this.formatCommToken(solve.comm_stats[solve.comm_stats.length - 1]);
  };

  handle_disconnect_cube = async () => {
    const { cube } = this.state;

    try {
      if (cube && typeof cube.disconnect === "function") {
        await cube.disconnect();
      }
    } catch (error) {
      console.warn("Failed to disconnect cube cleanly", error);
    } finally {
      this.setSmartCubeConnection({
        connected: false,
        cube: null,
        gan: false,
        connectionNotice: "Cube disconnected.",
      });
      this.handle_reset_cube("Cube state reset to solved.");
    }
  };

  buildSolveRecord = (data, setting, parseError = null) => {
    const solveText = data && data.txt ? data.txt : this.buildFallbackSolveText(setting, parseError);
    const parsedMetrics = this.extractSolveMetricsFromText(solveText);
    const fallbackTotal = parseFloat(setting.TIME_SOLVE || 0);
    const fallbackMemo = parseFloat(setting.MEMO || 0);
    const fallbackExe = Math.max(fallbackTotal - fallbackMemo, 0);
    let solveAnalysis = null;
    const providedCommStats = data && Array.isArray(data.commStats) ? data.commStats : null;
    const providedMoveTimeline = data && Array.isArray(data.moveTimeline) ? data.moveTimeline : null;

    if (!providedCommStats || !providedMoveTimeline) {
      try {
        solveAnalysis = buildSolveAnalysis(solveText, {
          edgeBuffer: setting.EDGES_BUFFER || "UF",
          cornerBuffer: setting.CORNER_BUFFER || "UFR",
        });
      } catch (error) {
        console.warn("Failed to analyze solve text locally", error);
      }
    }

    return {
      id: (data && data.id) || this.buildSolveId(),
      date: Date.now(),
      updatedAt: Date.now(),
      time_solve:
        parsedMetrics.time_solve !== null && parsedMetrics.time_solve !== undefined
          ? parsedMetrics.time_solve
          : fallbackTotal,
      memo_time:
        parsedMetrics.memo_time !== null && parsedMetrics.memo_time !== undefined
          ? parsedMetrics.memo_time
          : fallbackMemo,
      exe_time:
        parsedMetrics.exe_time !== null && parsedMetrics.exe_time !== undefined
          ? parsedMetrics.exe_time
          : fallbackExe,
      txt_solve: solveText,
      link: data && data.cubedb ? data.cubedb : null,
      fluidness:
        parsedMetrics.fluidness !== null && parsedMetrics.fluidness !== undefined
          ? parsedMetrics.fluidness
          : data && data.fluidness !== undefined
            ? data.fluidness
            : null,
      DNF: Boolean(parsedMetrics.isDnf),
      scramble: setting.SCRAMBLE || "",
      solve: (data && data.solve) || (solveAnalysis && solveAnalysis.solve) || setting.SOLVE || "",
      comm_stats: providedCommStats || (solveAnalysis && solveAnalysis.commStats) || [],
      move_timeline: providedMoveTimeline || (solveAnalysis && solveAnalysis.moveTimeline) || [],
      parseError,
    };
  };
  runLocalParse = (setting, _reason = null) => {
    const localResult = buildLocalSolveResult(setting, this.convert_sec_to_format);
    this.setState({
      parsed_solve: localResult,
      parsed_solve_cubedb: localResult.cubedb || null,
      parsed_solve_txt: localResult.txt,
      connectionNotice: null,
    });
    this.safelyStoreSolveResult(localResult, setting);
    this.handle_solve_status("Ready for scrambling");
  };

  newMovesNotation(move) {
    const cube_moves_new = [...this.state.cube_moves];
    const cube_moves_time_new = [...this.state.cube_moves_time];

    if (cube_moves_new.length === 0) {
      this.handle_solve_status("Scrambling");
    }
    if (this.state.solve_status == "Memo") {
      this.handle_solve_status("Solving");
    }

    if (move && move.endsWith("2")) {
      const base = move.slice(0, -1);
      cube_moves_new.push(base);
      cube_moves_time_new.push(Date.now());
      cube_moves_new.push(base);
      cube_moves_time_new.push(Date.now());
    } else {
      cube_moves_new.push(move);
      cube_moves_time_new.push(Date.now());
    }

    this.setState({ cube_moves: cube_moves_new, cube_moves_time: cube_moves_time_new });
    this.handle_moves_to_show(cube_moves_new);
  }

  getGanMacStorageKey = (device) => {
    const idPart = device && device.id ? device.id : "unknown-id";
    const namePart = device && device.name ? device.name : "unknown-name";
    return `gan-mac-cache::${idPart}::${namePart}`;
  };

  getCachedGanMac = (device) => {
    try {
      return window.localStorage.getItem(this.getGanMacStorageKey(device));
    } catch (err) {
      console.warn("[gan-web-bluetooth] unable to read cached MAC:", err);
      return null;
    }
  };

  setCachedGanMac = (device, mac) => {
    if (!mac) {
      return;
    }

    try {
      window.localStorage.setItem(this.getGanMacStorageKey(device), mac);
    } catch (err) {
      console.warn("[gan-web-bluetooth] unable to cache MAC:", err);
    }
  };

  provideGanMac = async (device, isForced) => {
    const cachedMac = this.getCachedGanMac(device);

    if (cachedMac) {
      console.log("[gan-web-bluetooth] using cached MAC:", cachedMac);
      return cachedMac;
    }

    if (!isForced) {
      console.log("[gan-web-bluetooth] no cached MAC available before advertisement lookup");
      return null;
    }

    console.warn("[gan-web-bluetooth] advertisement MAC lookup failed; requesting manual MAC");
    const input = window.prompt(
      `Enter the MAC address for ${device && device.name ? device.name : "your GAN cube"}.\nExample: CD:20:4C:9A:4E:42`
    );

    if (!input) {
      return null;
    }

    const normalizedMac = input.trim().toUpperCase();
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalizedMac)) {
      console.warn("[gan-web-bluetooth] invalid manual MAC format:", normalizedMac);
      return null;
    }

    this.setCachedGanMac(device, normalizedMac);
    return normalizedMac;
  };

  async connectGanCubeDirect() {
    try {
      this.setState({ connectionNotice: null });
      this.handle_solve_status("Connecting...");
      console.log("Requesting cube...");
      if (!navigator.bluetooth) {
        throw new Error("Web Bluetooth is not available in this browser.");
      }
      const cube = await connectGanCube(this.provideGanMac);
      console.log(`Connected: ${cube.deviceName}`);
      this.setCachedGanMac(cube.device, cube.deviceMAC);
      this.setSmartCubeConnection({ connected: true, cube, gan: true, connectionNotice: null });
      this.handle_solve_status("Connected");
      window.setTimeout(() => this.handle_solve_status("Ready for scrambling"), 800);

      cube.events$.subscribe((event) => {
        if (event.type === "MOVE") {
          console.log("Move: " + event.move);
          this.newMovesNotation(event.move);
          return;
        }

        if (event.type === "DISCONNECT") {
          console.log("Cube disconnected");
          this.setSmartCubeConnection({
            connected: false,
            cube: null,
            gan: false,
            connectionNotice: "Cube disconnected. Reconnect to resume smart-cube tracking.",
          });
          this.handle_solve_status("Connect Cube");
        }
      });

      return true;
    } catch (err) {
      console.warn("[gan-web-bluetooth] connect failed:", err);
      if (err && err.stack) {
        console.warn("[gan-web-bluetooth] connect failed stack:", err.stack);
      }
      const msg = err && err.message ? err.message : String(err);
      this.setSmartCubeConnection({
        connected: false,
        cube: null,
        gan: false,
        connectionNotice: `GAN direct connection failed: ${msg}`,
      });
      this.handle_solve_status("Connect Cube");
      return false;
    }
  }
  componentDidUpdate = () => {
    if (this.state.activeView !== "solve") {
      return;
    }

    const timerElement = document.getElementById("timer_element_2");
    if (timerElement && typeof timerElement.focus === "function") {
      timerElement.focus();
    }
  };
  convert_time_to_sec = (time) => {
    let split_time = time.split(":");
    if (split_time.length == 1) {
      return parseFloat(time);
    }
    return parseFloat(split_time[0]) * 60 + parseFloat(split_time[1]);
  };
  convert_sec_to_format = (time) => {
    if (typeof time == "string") {
      return time;
    }
    let time_str;
    let minute = Math.floor(time / 60);
    let sec = (time - minute * 60).toFixed(2);
    if (minute != 0) {
      if (sec < 10) {
        time_str = `${minute}:0${sec}`;
      } else {
        time_str = `${minute}:${sec}`;
      }
    } else {
      time_str = `${sec}`;
    }
    return time_str;
  };

  calc_average = (arr) => {
    let average;
    let dnf_arr = arr.map(({ DNF }) => DNF);
    let times_arr = arr
      .map(({ time_solve }) => time_solve)
      .map((x) => parseFloat(x));

    const sum = (previousValue, currentValue) => previousValue + currentValue;

    if (dnf_arr.filter((x) => x === true).length >= 2) {
      average = "DNF";
      return average;
    }
    if (dnf_arr.filter((x) => x === true).length === 1) {
      times_arr.splice(dnf_arr.indexOf(true), 1);
      times_arr.splice(times_arr.indexOf(Math.min(...times_arr)), 1);
      average = parseFloat(
        (times_arr.reduce(sum) / times_arr.length).toFixed(2)
      );
    } else {
      times_arr.splice(times_arr.indexOf(Math.min(...times_arr)), 1);
      times_arr.splice(times_arr.indexOf(Math.max(...times_arr)), 1);
      average = parseFloat(
        (times_arr.reduce(sum) / times_arr.length).toFixed(2)
      );
    }
    return average;
  };
  calc_mo3 = (arr) => {
    let mo3 = 0;
    let len = arr.length;
    let mo3_arr = arr.slice(len - 3, len);
    for (var i = 0; i < 3; i++) {
      if (mo3_arr[i]["DNF"] === true) {
        mo3 = "DNF";
        return mo3;
      } else {
        mo3 += parseFloat(mo3_arr[i]["time_solve"]);
      }
    }
    mo3 = parseFloat((mo3 / 3).toFixed(2));
    return mo3;
  };

  initialAveragesNoSolves = () => {
    let averages = {
      best: { time: 10000, solve: {} },
      mo3: "",
      ao5: "",
      ao12: "",
      bmo3: { time: 10000, solves: {}, num: 0 },
      bao5: { time: 10000, solves: {}, num: 0 },
      bao12: { time: 10000, solves: {}, num: 0 },
      aoAll: "",
      memo: "",
      exe: "",
      fluid: "",
      success: "",
    };
    localStorage.setItem("averages", JSON.stringify(averages));
    this.setState({ averages: averages });
  };
  initialAverages = () => {
    if (localStorage.getItem("averages") === null) {
      this.initialAveragesNoSolves();
    } else {
      let averages = JSON.parse(localStorage.getItem("averages"));
      let solve_stats = JSON.parse(localStorage.getItem("solves"));
      const aggregateStats = computeSessionAggregateStats(solve_stats, {
        calcMo3: this.calc_mo3,
        calcAverage: this.calc_average,
        formatSeconds: this.convert_sec_to_format,
      });

      averages["current"] = aggregateStats.current;
      averages["mo3"] = aggregateStats.mo3;
      averages["ao5"] = aggregateStats.ao5;
      averages["ao12"] = aggregateStats.ao12;
      averages["aoAll"] = aggregateStats.aoAll;
      averages["memo"] = aggregateStats.memo;
      averages["exe"] = aggregateStats.exe;
      averages["fluid"] = aggregateStats.fluid;
      averages["success"] = aggregateStats.success;

      localStorage.setItem("averages", JSON.stringify(averages));
      this.setState({ averages: averages });
    }
  };
  plus_two_last_solve = () => {
    this.updateActiveSessionSolves((solve_stats) => {
      const nextSolves = [...solve_stats];
      const num_solve = nextSolves.length - 1;

      if (num_solve < 0) {
        return nextSolves;
      }

      nextSolves[num_solve] = {
        ...nextSolves[num_solve],
        time_solve: parseFloat(nextSolves[num_solve].time_solve) + 2,
        exe_time: parseFloat(nextSolves[num_solve].exe_time) + 2,
      };

      return nextSolves;
    });
  };

  delete_solve = (num_solve) => {
    if (!window.confirm("Are you sure you want to delete the solve?")) {
      return;
    }

    this.updateActiveSessionSolves((solve_stats) => {
      const nextSolves = [...solve_stats];
      const nextIndex = nextSolves.length - num_solve - 1;
      nextSolves.splice(nextIndex, 1);
      return nextSolves;
    });
  };
  dnf_last_solve = () => {
    this.updateActiveSessionSolves((solve_stats) => {
      const nextSolves = [...solve_stats];
      const num_solve = nextSolves.length - 1;

      if (num_solve < 0) {
        return nextSolves;
      }

      nextSolves[num_solve] = {
        ...nextSolves[num_solve],
        DNF: !nextSolves[num_solve].DNF,
      };

      return nextSolves;
    });
  };

  delete_last_solve = () => {
    if (!window.confirm("Are you sure you want to delete last solve?")) {
      return;
    }

    this.updateActiveSessionSolves((solve_stats) => {
      const nextSolves = [...solve_stats];
      nextSolves.splice(nextSolves.length - 1, 1);
      return nextSolves;
    });
  };
  renderTableData = (solve_stats) => {
    let header_elem = (
      <React.Fragment>
        <th key="num">#</th>
        <th key="time">time</th>
        <th key="memo">memo</th>
        {/* <th key="exe">exe</th> */}
        <th key="fluidness">fluid</th>
        <th key="link">link</th>
      </React.Fragment>
    );
    let len = solve_stats.length;
    solve_stats.reverse();
    let rows = solve_stats.map((solve, index) => {
      const {
        DNF,
        exe_time,
        fluidness,
        link,
        memo_time,
        date,
        time_solve,
        txt_solve,
      } = solve; //destructuring
      return (
        <tr key={date}>
          <td>
            <a
              href="#"
              title="delete solve"
              value={index}
              onClick={() => this.delete_solve(index)}
            >
              <div>{len - index}</div>
            </a>
          </td>
          <td>
            {DNF
              ? "DNF(" + this.convert_sec_to_format(time_solve) + ")"
              : this.convert_sec_to_format(time_solve)}{" "}
          </td>
          <td>{this.convert_sec_to_format(memo_time)}</td>
          {/* <td>{exe_time}</td> */}
          <td>
            {!DNF ? fluidness : ""}
            {fluidness && !DNF ? "%" : ""}
          </td>
          <td>
            <a href={link} target="_blank" title={txt_solve}>
              <div>link</div>
            </a>
          </td>
        </tr>
      );
    });
    solve_stats.reverse();
    let new_table = (
      <React.Fragment>
        <tr>{header_elem}</tr>
        {rows}
      </React.Fragment>
    );

    this.setState({ renderTable: new_table });
  };
  generateCsvURL = (solve_stats, averages) => {
    let copy_solve_stats = [...solve_stats];
    copy_solve_stats = [...copy_solve_stats].map(function (x) {
      let obj;
      obj = { ...x };
      obj["date"] = new Date(x["date"]);
      return obj;
    });
    let items = copy_solve_stats;
    const replacer = (key, value) => (value === null ? "" : value); // specify how you want to handle null values here
    let header = Object.keys(items[0]);
    const csv_solves = [
      header.join(","), // header row first
      ...items.map((row) =>
        header
          .map((fieldName) => JSON.stringify(row[fieldName], replacer))
          .join(",")
      ),
    ].join("\r\n");
    items = averages;
    header = Object.keys(items);
    items = Object.values(items);
    items = [...items].map(function (x) {
      if (typeof x === "object") {
        let obj = x["time"];
        return obj;
      }
      return x;
    });

    const csv_averages = [header.join(","), [...items].join(",")].join("\r\n");

    const all = csv_averages + "\r\n\r\n" + csv_solves;
    var data = new Blob([all], { type: "text/csv" });
    let url_csv = window.URL.createObjectURL(data);
    return url_csv;
  };
  calc_best_average = () => {
    let solve_stats = JSON.parse(localStorage.getItem("solves"));
    let cur_averages = JSON.parse(localStorage.getItem("averages"));
    if (cur_averages["mo3"] != "" && cur_averages["mo3"] != "DNF") {
      if (cur_averages["mo3"] < cur_averages["bmo3"]["time"]) {
        cur_averages["bmo3"]["time"] = cur_averages["mo3"];
        cur_averages["bmo3"]["num"] = solve_stats.length - 2;

        cur_averages["bmo3"]["solves"] = solve_stats.slice(
          solve_stats.length - 3,
          solve_stats.length
        );
      }
    }

    if (cur_averages["ao5"] != "" && cur_averages["ao5"] != "DNF") {
      if (cur_averages["ao5"] < cur_averages["bao5"]["time"]) {
        cur_averages["bao5"]["time"] = cur_averages["ao5"];
        cur_averages["bao5"]["num"] = solve_stats.length - 4;
        cur_averages["bao5"]["solves"] = solve_stats.slice(
          solve_stats.length - 5,
          solve_stats.length
        );
      }
    }
    if (cur_averages["ao12"] != "" && cur_averages["ao12"] != "DNF") {
      if (cur_averages["ao12"] < cur_averages["bao12"]["time"]) {
        cur_averages["bao12"]["time"] = cur_averages["ao12"];
        cur_averages["bao12"]["num"] = solve_stats.length - 11;

        cur_averages["bao12"]["solves"] = solve_stats.slice(
          solve_stats.length - 12,
          solve_stats.length
        );
      }
    }
    if (solve_stats.length > 0) {
      console.log("heree");
      console.log(solve_stats[solve_stats.length - 1]);
      if (
        solve_stats[solve_stats.length - 1] != "" &&
        solve_stats[solve_stats.length - 1]["DNF"] !== true
      ) {
        if (
          solve_stats[solve_stats.length - 1]["time_solve"] <
          cur_averages["best"]["time"]
        ) {
          cur_averages["best"]["time"] =
            solve_stats[solve_stats.length - 1]["time_solve"];
          cur_averages["best"]["num"] = solve_stats.length;

          cur_averages["best"]["solve"] = solve_stats[solve_stats.length - 1];
        }
      }
    }
    localStorage.setItem("averages", JSON.stringify(cur_averages));
    this.setState({ averages: cur_averages });
  };

  calc_best_average_after_delete = () => {
    let solve_stats = JSON.parse(localStorage.getItem("solves"));
    let cur_averages = JSON.parse(localStorage.getItem("averages"));
    let cur = { best: 10000, mo3: 10000, ao5: 10000, ao12: 10000 };
    let best = {
      best: { time: 10000, num: 0, solve: {} },
      mo3: { time: 10000, num: 0, solves: {} },
      ao5: { time: 10000, num: 0, solves: {} },
      ao12: { time: 10000, num: 0, solves: {} },
    };

    let len = solve_stats.length;
    for (var i = 0; i < solve_stats.length; i++) {
      if (i + 1 <= len) {
        cur["best"] = solve_stats[i]["time_solve"];
        console.log(solve_stats[i]);
        if (cur["best"] < best["best"]["time"] && !solve_stats[i]["DNF"]) {
          best["best"]["time"] = parseFloat(cur["best"]);
          best["best"]["num"] = i;
          best["best"]["solve"] = solve_stats[i];
        }
      }

      if (i + 3 <= len) {
        cur["mo3"] = this.calc_mo3(solve_stats.slice(i, i + 3));
        if (cur["mo3"] < best["mo3"]["time"]) {
          best["mo3"]["time"] = cur["mo3"];
          best["mo3"]["num"] = i;
          best["mo3"]["solves"] = solve_stats.slice(i, i + 3);
        }
      }

      if (i + 5 <= len) {
        cur["ao5"] = this.calc_average(solve_stats.slice(i, i + 5));
        if (cur["ao5"] < best["ao5"]["time"]) {
          best["ao5"]["time"] = cur["ao5"];
          best["ao5"]["num"] = i;
          best["ao5"]["solves"] = solve_stats.slice(i, i + 5);
        }
      }

      if (i + 12 <= len) {
        cur["ao12"] = this.calc_average(solve_stats.slice(i, i + 12));
        if (cur["ao12"] < best["ao12"]["time"]) {
          best["ao12"]["time"] = cur["ao12"];
          best["ao12"]["num"] = i;
          best["ao12"]["solves"] = solve_stats.slice(i, i + 12);
        }
      }
    }
    cur_averages["best"] = best["best"];
    cur_averages["bmo3"] = best["mo3"];
    cur_averages["bao5"] = best["ao5"];
    cur_averages["bao12"] = best["ao12"];
    localStorage.setItem("averages", JSON.stringify(cur_averages));
    this.setState({ averages: cur_averages });
  };

  initialStatsFromLocalstorage = () => {
    const { sessions, activeSessionId, activeSession } = this.ensureSessionStorage();
    const solve_stats = activeSession && Array.isArray(activeSession.solves) ? activeSession.solves : [];
    const storedAverages = this.parseJsonStorage("averages", this.state.averages);

    if (solve_stats.length > 0) {
      let url_csv = this.generateCsvURL(solve_stats, storedAverages);
      this.setState({ url_stats: url_csv }, () => {});
    } else {
      this.setState({ url_stats: "" });
    }

    this.setState({ sessions, activeSessionId, solves_stats: solve_stats });
    this.renderTableData(solve_stats);
    this.initialAverages();
    this.calc_best_average();
  };
  addSolveToLocalStorage = (data, setting, parseError = null) => {
    const solveStats = this.buildSolveRecord(data, setting, parseError);

    this.updateActiveSessionSolves((currentSolves) => [...currentSolves, solveStats]);
    if (this.hasCloudSync()) {
      this.syncSessionsWithCloud(this.state.activeSessionId).catch((error) => {
        console.warn("Cloud sync after solve save failed", error);
      });
    }
    return solveStats;
  };
  safelyStoreSolveResult = (result, setting) => {
    try {
      if (this.hasCloudSync()) {
        this.addSolveToLocalStorage(result, setting);
        return;
      }

      if (result && result.session && result.saved_solve) {
        const normalizedSession = this.normalizeServerSession({
          ...result.session,
          solves: [],
        });
        const normalizedSolve = this.normalizeServerSolve(result.saved_solve);
        const { sessions } = this.ensureSessionStorage();
        const existingIndex = sessions.findIndex((session) => session.id === normalizedSession.id);
        let nextSessions = [...sessions];

        if (existingIndex >= 0) {
          const existingSolves = Array.isArray(nextSessions[existingIndex].solves)
            ? nextSessions[existingIndex].solves
            : [];
          nextSessions[existingIndex] = {
            ...nextSessions[existingIndex],
            ...normalizedSession,
            solves: [...existingSolves, normalizedSolve],
          };
        } else {
          nextSessions.push({
            ...normalizedSession,
            solves: [normalizedSolve],
          });
        }

        this.persistSessionStorage(nextSessions, normalizedSession.id);
        this.setState(
          {
            sessions: nextSessions,
            activeSessionId: normalizedSession.id,
          },
          this.initialStatsFromLocalstorage
        );
        return;
      }

      this.addSolveToLocalStorage(result, setting);
    } catch (error) {
      console.error("Failed to store solve result from server response", error, result);
      this.addSolveToLocalStorage(result, setting, "Server response merge failed");
      this.setState({ connectionNotice: null });
    }
  };
  extract_solve_from_cube_moves = (timer_finish) => {
    let parse_setting_new = { ...this.state.parse_settings };
    let solve_time = 0;
    let moves = this.state.cube_moves;
    let moves_time = this.state.cube_moves_time;
    let time_start_solve = this.state.timeStart;
    let time_end_solve = timer_finish;
    const extracted = extractRecordedSolveData({
      moves,
      moveTimes: moves_time,
      timeStart: time_start_solve,
      timeFinish: time_end_solve,
    });
    const scramble = extracted.scramble;
    const solve = extracted.solve;
    const memo_time = extracted.memoTime;

    solve_time = ((time_end_solve - time_start_solve) / 1000).toFixed(2);
    console.log(time_end_solve, time_start_solve, solve_time)
    const extractedScramble = scramble
      .join(" ")
      .toString()
      .replace(/  +/g, " ");
    const hasRecordedCubeMoves = Array.isArray(moves) && moves.length > 0;
    parse_setting_new["PLANNED_SCRAMBLE"] = this.state.scramble || "";
    parse_setting_new["SCRAMBLE"] = extractedScramble || (hasRecordedCubeMoves ? "" : this.state.scramble || "");
    parse_setting_new["SOLVE"] = solve
      .join(" ")
      .toString()
      .replace(/  +/g, " ");
    parse_setting_new["MEMO"] = memo_time.toString();
    parse_setting_new["TIME_SOLVE"] = solve_time.toString();
    // console.log(scramble.length);
    // console.log(this.state.cube_moves_time);

    parse_setting_new["SOLVE_TIME_MOVES"] = JSON.stringify(extracted.solveMoveOffsets);
    parse_setting_new["SAVE_SOLVE"] = true;
    parse_setting_new["SESSION_ID"] = this.isServerSessionId(this.state.activeSessionId)
      ? this.state.activeSessionId
      : null;
    this.setState({ parse_settings: parse_setting_new });
    return parse_setting_new;
  };

  handle_solve_status = (next_status) => {
    if (next_status === "Parsing didn't succeed") {
      this.setState({ solve_status: next_status });
    }
    if (this.state.solve_status === "Parsing didn't succeed") {
      new Promise((r) => setTimeout(r, 2000)).then(() => {
        this.setState({ solve_status: "Ready for scrambling" });
      });
    }
    if (
      this.state.solve_status === "Connect Cube" &&
      next_status === "Connecting..."
    ) {
      this.setState({ solve_status: next_status });
    }
    if (
      this.state.solve_status === "Connecting..." &&
      next_status === "Connected"
    ) {
      this.setState({ solve_status: next_status });
    }
    if (
      this.state.solve_status === "Connected" &&
      next_status === "Ready for scrambling"
    ) {
      this.setState({ solve_status: next_status });
    }
    if (
      this.state.solve_status === "Connecting..." &&
      next_status === "Ready for scrambling"
    ) {
      this.setState({ solve_status: next_status });
    }
    if (
      this.state.solve_status === "Ready for scrambling" &&
      next_status === "Scrambling"
    ) {
      this.setState({ solve_status: next_status });
    }
    if (
      this.state.solve_status === "Scrambling" &&
      next_status === "Ready for scrambling"
    ) {
      this.setState({ solve_status: next_status });
    }
    if (this.state.solve_status === "Scrambling" && next_status === "Memo") {
      this.setState({ solve_status: next_status });
    }
    if (this.state.solve_status === "Memo" && next_status === "Solving") {
      this.setState({ solve_status: next_status });
    }
    if (this.state.solve_status === "Solving" && next_status === "Parsing...") {
      this.setState({ solve_status: next_status });
    }
    if (
      this.state.solve_status === "Parsing..." &&
      next_status === "Ready for scrambling"
    ) {
      this.setState({ solve_status: next_status });
    }
  };
  handle_onStart_timer = (timer_start) => {
    this.setState({ timeStart: timer_start, moves_to_show: "" });
    let parse_setting_new = { ...this.state.parse_settings };
    var options = {
      hour: "2-digit",
      minute: "2-digit",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    };
    var today = new Date();
    parse_setting_new["DATE_SOLVE"] = today.toLocaleDateString(
      "en-US",
      options
    );
    this.setState({ parse_settings: parse_setting_new });
    this.handle_solve_status("Memo");
  };
  makeid = (length) => {
    var result = "";
    var characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  };
  handle_onStop_timer = (timer_finish) => {
    new Promise((resolve) => setTimeout(resolve, 400))
      .then((data) => {
        const timeStart = this.state.timeStart;
        const hasValidStart = Number.isFinite(timeStart);

        if (this.state.gan === true) {
          if (!this.state.cube_moves_time.length) {
            this.handle_accidental_timer_stop("No solve moves were recorded, so that stop was ignored.");
            return;
          }
          console.log("here gan");
          timer_finish =
            this.state.cube_moves_time[this.state.cube_moves_time.length - 1] +
            1;
        }

        if (!hasValidStart || !Number.isFinite(timer_finish) || timer_finish <= timeStart) {
          this.handle_accidental_timer_stop("Timer stop happened before a valid solve was recorded.");
          return;
        }

        if (timer_finish - timeStart < 350) {
          this.handle_accidental_timer_stop("Very short timer stop ignored.");
          return;
        }

        this.setState({ timeFinish: timer_finish });
        this.handle_solve_status("Parsing...");
        this.handle_parse_solve(timer_finish);
        this.setState({ cube_moves: [], cube_moves_time: [], moves_to_show: "" });
        this.handle_scramble();
      })
      .catch((data) => console.log(data));
  };
  handle_export_setting = (settings) => {
    let new_settings = { ...this.state.parse_settings };
    for (var key in settings) {
      if (!(key in this.state.parse_settings)) {
        if (key == "CUBE_OREINTATION") {
          new_settings[key] = settings[key];
        } else if (key == "SCRAMBLE_TYPE") {
          new_settings[key] = settings[key];
        } else {
          console.log("wrong keys : ", key);
        }
      } else {
        new_settings[key] = settings[key];
      }
      this.setState({ parse_settings: new_settings });
    }
    localStorage.setItem("setting", JSON.stringify(new_settings));
  };
  handle_reset_cube = (message = "Cube state reset to solved.") => {
    const nextMessage =
      message && typeof message === "object" && typeof message.preventDefault === "function"
        ? "Cube state reset to solved."
        : message;
    this.setState({
      cube_moves: [],
      cube_moves_time: [],
      moves_to_show: "",
      connectionNotice: nextMessage,
    });
    this.handle_solve_status("Ready for scrambling");
  };
  handle_accidental_timer_stop = (message = "Accidental stop ignored") => {
    this.setState({
      cube_moves: [],
      cube_moves_time: [],
      moves_to_show: "",
      connectionNotice: message,
      timeFinish: null,
    });
    this.handle_solve_status("Ready for scrambling");
  };
  handle_parse_solve = (timer_finish) => {
    const setting = this.extract_solve_from_cube_moves(timer_finish);
    console.log(setting);
    if (this.state.remoteParserAvailable === false) {
      this.runLocalParse(
        setting,
        "The advanced parser backend is unavailable, so JBLD used local PWA mode instead."
      );
      return;
    }
    let result;
    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(setting),
    };

    const parseUrl = `${this.getApiOrigin()}/parse`;

    fetch(parseUrl, requestOptions)
      .then(async (response) => {
        const rawBody = await response.text();
        let data = null;

        try {
          data = rawBody ? JSON.parse(rawBody) : null;
        } catch (error) {
          console.log("Failed to parse /parse response body");
          console.log(rawBody);
          throw error;
        }

        if (!response.ok) {
          console.log("/parse returned error status", response.status);
          console.log(data);
          throw new Error(
            data && data.details ? data.details : `Parse failed with status ${response.status}`
          );
        }

        return data;
      })
      .then((data) => {
        result = data;
        console.log("request to parsing server");
        console.log(requestOptions);
        if (result && result.save_error) {
          console.warn("Solve parsed but failed to save on server", result.save_error);
          this.setState({ connectionNotice: null });
        }
        this.setState({ parsed_solve: result });
        if ("cubedb" in result) {
          this.setState({ parsed_solve_cubedb: result["cubedb"] });
          console.log(result["cubedb"]);
          // window.open(result["cubedb"]);
        }
        if ("txt" in result) {
          console.log(result["txt"]);
          this.setState({ parsed_solve_txt: result["txt"] });
        }

        this.safelyStoreSolveResult(result, setting);

        this.handle_solve_status("Ready for scrambling");
      })
      .catch((error) => {
        console.log(requestOptions["body"]);
        console.log(error);
        const parseError = error && error.message ? error.message : "Unknown parse error";
        this.setState({ remoteParserAvailable: false }, () => {
          this.runLocalParse(
            setting,
            `The remote parser failed (${parseError}). JBLD switched to local PWA mode.`
          );
        });
      });
  };
  handle_scramble = () => {
    this.setState({ last_scramble: this.state.scramble });
    this.setState({
      scramble: cubeSolver.scramble(this.state.parse_settings["SCRAMBLE_TYPE"]),
    });
  };
  handle_moves_to_show = (cube_moves) => {
    if (this.state.gan) {
      this.setState({ moves_to_show: "" });
    } else if (this.state.solve_status === "Scrambling") {
      this.setState({ moves_to_show: cube_moves.join(" ") });
    } else {
      this.setState({ moves_to_show: "" });
    }
  };
  handle_last_scramble = () => {
    this.setState({ scramble: this.state.last_scramble });
  };
  handle_reset_stats = () => {
    if (window.confirm("Are you sure you want to reset stats?")) {
      this.updateActiveSessionSolves(() => []);
    }
  };
  resetLocalAppData = () => {
    if (
      !window.confirm(
        "Reset all local JBLD data on this device? This clears sessions, solves, averages, and cached app state."
      )
    ) {
      return;
    }

    const preservedSetting = this.state.parse_settings;
    const freshSession = this.buildSessionRecord("Session 1", []);

    try {
      localStorage.removeItem("sessions");
      localStorage.removeItem("activeSessionId");
      localStorage.removeItem("solves");
      localStorage.removeItem("averages");
      localStorage.removeItem("setting");
      localStorage.setItem("setting", JSON.stringify(preservedSetting));
      localStorage.setItem("sessions", JSON.stringify([freshSession]));
      localStorage.setItem("activeSessionId", JSON.stringify(freshSession.id));
      localStorage.setItem("solves", JSON.stringify([]));
    } catch (error) {
      console.error("Failed to reset local app data", error);
    }

    this.initialAveragesNoSolves();
    this.setState(
      {
        showMenu: false,
        showSettings: false,
        showLastSolveDetails: false,
        loadingSolveDetails: false,
        selectedSolveDetails: null,
        activeView: "solve",
        sessions: [freshSession],
        activeSessionId: freshSession.id,
        solves_stats: [],
        renderTable: null,
        parsed_solve: null,
        parsed_solve_txt: null,
        parsed_solve_cubedb: null,
        connectionNotice: "Local JBLD data was reset on this device.",
      },
      () => {
        this.handle_scramble();
        this.initialStatsFromLocalstorage();
      }
    );
  };
  formatSummaryValue = (value, empty = "-") => {
    if (value === null || value === undefined || value === "" || value === 10000) {
      return empty;
    }
    return this.convert_sec_to_format(value);
  };
  formatMetricText = (value, suffix = "", empty = "--") => {
    if (value === null || value === undefined || value === "" || value === 10000) {
      return empty;
    }

    if (typeof value === "number") {
      return `${this.convert_sec_to_format(value)}${suffix}`;
    }

    return `${value}${suffix}`;
  };
  copyScramble = () => {
    if (!this.state.scramble || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(this.state.scramble).catch((error) => {
      console.warn("Failed to copy scramble", error);
    });
  };
  desktop_layout = () => {
    const accuracyText = this.state.averages.success || "--";
    const ao5Text = this.formatSummaryValue(this.state.averages.ao5);
    const sessions = [...this.state.sessions].sort(
      (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
    );
    const activeSession = this.getActiveSessionFromList(sessions, this.state.activeSessionId);
    const activeSessionSummary = this.getSessionSummary(activeSession);
    const recentSolves = [...this.state.solves_stats].slice().reverse();
    const chartSolves = recentSolves
      .filter(({ DNF, time_solve }) => !DNF && Number.isFinite(parseFloat(time_solve)))
      .slice(0, 20);
    const chartTimes = chartSolves.map(({ time_solve }) => parseFloat(time_solve));
    const dnfCount = recentSolves.filter(({ DNF }) => DNF).length;
    const completedCount = recentSolves.length - dnfCount;
    const latestSolve = recentSolves[0] || null;
    const memoText = latestSolve ? this.convert_sec_to_format(latestSolve.memo_time) : "--";
    const execText = latestSolve ? this.convert_sec_to_format(latestSolve.exe_time) : "--";
    const latestFive = recentSolves.slice(0, 5);
    const trendLabel =
      latestFive.length >= 2 &&
      !latestFive[0].DNF &&
      !latestFive[latestFive.length - 1].DNF &&
      Number.isFinite(parseFloat(latestFive[0].time_solve)) &&
      Number.isFinite(parseFloat(latestFive[latestFive.length - 1].time_solve))
        ? parseFloat(latestFive[0].time_solve) <= parseFloat(latestFive[latestFive.length - 1].time_solve)
          ? "Trending faster"
          : "Needs review"
        : "Building data";
    const bestSingle = recentSolves
      .filter(({ DNF, time_solve }) => !DNF && Number.isFinite(parseFloat(time_solve)))
      .reduce((best, solve) => {
        const next = parseFloat(solve.time_solve);
        if (best === null || next < best) {
          return next;
        }
        return best;
      }, null);
    const sessionCount = recentSolves.length;
    const solveCountLabel = `${sessionCount} ${sessionCount === 1 ? "solve" : "solves"}`;
    const troubleSolves = [...recentSolves]
      .filter(({ time_solve }) => Number.isFinite(parseFloat(time_solve)))
      .sort((a, b) => parseFloat(b.time_solve) - parseFloat(a.time_solve))
      .slice(0, 3);
    const formatDate = (dateValue) =>
      new Date(dateValue).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    const formatHistoryDate = (dateValue) => {
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) {
        return "--";
      }

      const parts = new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(date);
      const getPart = (type) => {
        const part = parts.find((entry) => entry.type === type);
        return part ? part.value : "";
      };

      return `${getPart("day")} ${getPart("month")}, ${getPart("hour")}:${getPart("minute")}`;
    };
    const chartPath =
      chartTimes.length > 1
        ? (() => {
            const min = Math.min(...chartTimes);
            const max = Math.max(...chartTimes);
            const spread = Math.max(max - min, 0.01);
            return chartTimes
              .map((value, index) => {
                const x = (index / (chartTimes.length - 1)) * 100;
                const y = 100 - ((value - min) / spread) * 72 - 14;
                return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
              })
              .join(" ");
          })()
        : "";
    const viewConfig = {
      solve: {
        title: "Solve",
        eyebrow: "Live Session",
        heading: "Timer, scramble, and smart-cube flow stay front and center here.",
        body: null,
      },
      drill: {
        title: "Drill",
        eyebrow: "Drill",
        heading: "Targeted training blocks for the cases you want to sharpen.",
        body: "Use drills to focus on commutators, buffers, and recurring weak spots from your solve data.",
      },
      study: {
        title: "Study",
        eyebrow: "Study",
        heading: "Review analytics, trouble cases, and personal practice collections.",
        body: "This page brings your execution trends and weak cases together in one place.",
      },
      history: {
        title: "History",
        eyebrow: "History",
        heading: "Recent solves and reconstruction review live here.",
        body: "Use the latest solve cards to inspect times, memo, and CubeDB links quickly.",
      },
      stats: {
        title: "Stats",
        eyebrow: "Stats",
        heading: "Execution trends, memo splits, and progress charts belong here.",
        body: "This view uses your stored solve data to mirror the analytics screen direction from Figma.",
      },
      sessions: {
        title: "Sessions",
        eyebrow: "Sessions",
        heading: "Session management and drill groups can move into this view.",
        body: "Until real session grouping exists, this screen summarizes the recent solve set as one active session.",
      },
    };
    const currentView = viewConfig[this.state.activeView] || viewConfig.solve;
    const selectedSolveDetailsData = this.getSolveDetailsViewData(
      this.state.selectedSolveDetails,
      activeSession && Array.isArray(activeSession.solves) ? activeSession.solves : []
    );
    const lastSolvePanelData = this.getLastSolvePanelData(latestSolve);
    const timerDisplayMs = this.getTimerDisplayMs(latestSolve);
    let mainView;

    if (this.state.activeView === "drill") {
      mainView = (
        <section className="drill_screen view_panel">
          <div className="section_header">
            <div>
              <div className="placeholder_title">Drill Builder</div>
              <div className="placeholder_text">{currentView.body}</div>
            </div>
          </div>
          <div className="drill_tabs">
            <button type="button" className="drill_tab drill_tab_active">
              Corners
            </button>
            <button type="button" className="drill_tab">Edges</button>
            <button type="button" className="drill_tab">Parity</button>
            <button type="button" className="drill_tab">Flip/Twists</button>
          </div>
          <div className="drill_filters">
            <div className="drill_filter_group">
              <span className="drill_filter_label">Filter Drill Sets</span>
              <div className="drill_filter_chips">
                <button type="button" className="drill_chip drill_chip_active">
                  Commutators
                </button>
                <button type="button" className="drill_chip">3-Style</button>
                <button type="button" className="drill_chip">Unmastered</button>
              </div>
            </div>
          </div>
          <div className="drill_card_list">
            <article className="drill_card">
              <div>
                <div className="drill_card_title">Corner Commutators (Pure)</div>
                <div className="drill_card_text">Warm up with pure commutators around your current corner buffer.</div>
              </div>
              <div className="drill_card_side">
                <div className="drill_badge">Level 1</div>
                <button type="button" className="drill_action_button">
                  Start Drill
                </button>
              </div>
            </article>
            <article className="drill_card">
              <div>
                <div className="drill_card_title">Buffer UFR Distance</div>
                <div className="drill_card_text">Review cases that travel far from your corner buffer and slow recognition.</div>
              </div>
              <div className="drill_card_side">
                <div className="drill_badge">25 cases</div>
                <button type="button" className="drill_action_button drill_action_button_secondary">
                  Resume Practice
                </button>
              </div>
            </article>
            <article className="drill_card">
              <div>
                <div className="drill_card_title">Edge Flips & Corner Twists</div>
                <div className="drill_card_text">Quick isolated rep set for the special cases that still break flow.</div>
              </div>
              <div className="drill_card_side">
                <div className="drill_badge">Mixed</div>
                <button type="button" className="drill_action_button drill_action_button_secondary">
                  Configure Drill
                </button>
              </div>
            </article>
          </div>
        </section>
      );
    } else if (this.state.activeView === "study") {
      mainView = (
        <section className="study_screen view_panel">
          <div className="section_header">
            <div>
              <div className="placeholder_title">Study & Analytics</div>
              <div className="placeholder_text">{currentView.body}</div>
            </div>
          </div>
          <div className="study_tabs">
            <button type="button" className="study_tab study_tab_active">
              Analytics
            </button>
            <button type="button" className="study_tab">Trouble Algs</button>
            <button type="button" className="study_tab">Library</button>
          </div>
          <div className="study_chart_card">
            <div className="chart_card_header">
              <div>
                <div className="chart_card_title">Execution Performance</div>
                <div className="study_stat_caption">Avg. execution time</div>
              </div>
              <div className="study_hero_stat">{execText}</div>
            </div>
            {chartPath ? (
              <div className="chart_canvas">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path className="chart_grid" d="M 0 20 L 100 20 M 0 50 L 100 50 M 0 80 L 100 80" />
                  <path className="chart_area" d={`${chartPath} L 100 100 L 0 100 Z`} />
                  <path className="chart_line" d={chartPath} />
                </svg>
              </div>
            ) : (
              <div className="empty_chart_state">Log more solves to unlock analytics here.</div>
            )}
          </div>
          <div className="study_section_header">
            <div className="chart_card_title">Trouble Algorithms</div>
            <div className="section_meta">From recent solves</div>
          </div>
          <div className="study_problem_list">
            {troubleSolves.length ? (
              troubleSolves.map((solve, index) => (
                <article key={solve.date || index} className="study_problem_card">
                  <div>
                    <div className="study_problem_title">Case #{sessionCount - index}</div>
                    <div className="study_problem_text">{solve.txt_solve ? solve.txt_solve.split("\n")[0] : "Slow recognition pattern"}</div>
                  </div>
                  <div className="study_problem_side">
                    <strong>{this.convert_sec_to_format(solve.time_solve)}</strong>
                    <span>{formatDate(solve.date)}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty_state_card">
                <div className="placeholder_eyebrow">Study</div>
                <div className="placeholder_text">Your slowest cases will show up here after a few logged solves.</div>
              </div>
            )}
          </div>
          <div className="study_section_header">
            <div className="chart_card_title">Personal Library</div>
            <div className="section_meta">Saved drill stacks</div>
          </div>
          <div className="study_library_grid">
            <article className="study_library_card">
              <div className="study_library_title">Book 1: 3-Style Corners</div>
              <div className="study_library_text">Foundational review deck for corner commutators and setup moves.</div>
            </article>
            <article className="study_library_card">
              <div className="study_library_title">Edge Commutator Drills</div>
              <div className="study_library_text">Focused practice stack for edge buffer transitions and recognition.</div>
            </article>
          </div>
        </section>
      );
    } else if (this.state.activeView === "history") {
      mainView = (
        <section className="history_screen view_panel">
          <div className="history_header">
            <div className="history_session_picker">
              <button
                type="button"
                className="history_session_button"
                onClick={() =>
                  this.setState((state) => ({
                    historySessionMenuOpen: !state.historySessionMenuOpen,
                  }))
                }
                aria-expanded={this.state.historySessionMenuOpen}
              >
                <span>{activeSession ? activeSession.name : "No active session"}</span>
                <span className="history_session_chevron" aria-hidden="true"></span>
              </button>
              {this.state.historySessionMenuOpen && (
                <div className="history_session_menu">
                  {sessions.map((session) => {
                    const summary = this.getSessionSummary(session);
                    const isActive = activeSession && session.id === activeSession.id;

                    return (
                      <button
                        key={session.id}
                        type="button"
                        className={`history_session_option ${isActive ? "history_session_option_active" : ""}`}
                        onClick={() =>
                          this.setState({ historySessionMenuOpen: false }, () =>
                            this.activateSession(session.id)
                          )
                        }
                      >
                        <span>{session.name}</span>
                        <small>{summary.totalSolves} solves</small>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="history_solve_count">{solveCountLabel}</div>
          </div>
          <div className="history_list">
            {recentSolves.length ? (
              recentSolves.map((solve, index) => (
                <button
                  key={solve.date || index}
                  type="button"
                  className="history_card history_card_button"
                  onClick={() => this.openSolveDetails(solve)}
                >
                  <div className="history_solve_row">
                    <div className="history_card_title">
                      Solve {sessionCount - index}
                      {solve.DNF ? " (DNF)" : ""}
                    </div>
                    <div className="history_card_time">
                      {this.convert_sec_to_format(solve.time_solve)}
                    </div>
                  </div>
                  <div className="history_solve_row history_solve_row_meta">
                    <div className="history_card_subtitle">{formatHistoryDate(solve.date)}</div>
                    <div className="history_card_subtitle history_split_times">
                      {this.convert_sec_to_format(solve.memo_time)} | {this.convert_sec_to_format(solve.exe_time)}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="empty_state_card">
                <div className="placeholder_eyebrow">History</div>
                <div className="placeholder_text">
                  Complete a solve and this screen will start filling with recent attempts.
                </div>
              </div>
            )}
          </div>
        </section>
      );
    } else if (this.state.activeView === "stats" || this.state.activeView === "sessions") {
      if (this.state.activeView === "stats") {
        mainView = (
          <section className="stats_screen view_panel">
            <div className="stats_header">
              <div>
                <div className="placeholder_title">Session Stats</div>
                <div className="placeholder_text">{currentView.body}</div>
              </div>
              <div className="section_meta">{completedCount} completed</div>
            </div>
            <div className="stats_grid">
              <div className="stats_tile">
                <span>Ao5</span>
                <strong>{ao5Text}</strong>
              </div>
              <div className="stats_tile">
                <span>Ao12</span>
                <strong>{this.formatSummaryValue(this.state.averages.ao12)}</strong>
              </div>
              <div className="stats_tile">
                <span>Ao50</span>
                <strong>{this.formatSummaryValue(this.state.averages.aoAll)}</strong>
              </div>
              <div className="stats_tile">
                <span>Mean</span>
                <strong>{this.formatSummaryValue(this.state.averages.current)}</strong>
              </div>
            </div>
            <div className="stats_breakdown_grid">
              <div className="breakdown_card">
                <span>Memo Avg</span>
                <strong>{memoText}</strong>
              </div>
              <div className="breakdown_card">
                <span>Exec Avg</span>
                <strong>{execText}</strong>
              </div>
              <div className="breakdown_card">
                <span>DNFs</span>
                <strong>{dnfCount}</strong>
              </div>
              <div className="breakdown_card">
                <span>Best Ao12</span>
                <strong>{this.formatSummaryValue(this.state.averages.bao12.time)}</strong>
              </div>
            </div>
            <div className="personal_best_card">
              <div>
                <div className="placeholder_eyebrow">Personal Best</div>
                <div className="personal_best_value">
                  {bestSingle === null ? "--" : this.convert_sec_to_format(bestSingle)}
                </div>
              </div>
              <div className="personal_best_badge">
                {trendLabel === "Trending faster" ? "Up" : "PB"}
              </div>
            </div>
            <div className="chart_card">
              <div className="chart_card_header">
                <div className="chart_card_title">Session Progress</div>
                <div className="section_meta">Last {chartTimes.length || 0} solves</div>
              </div>
              {chartPath ? (
                <div className="chart_canvas">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path className="chart_grid" d="M 0 20 L 100 20 M 0 50 L 100 50 M 0 80 L 100 80" />
                    <path className="chart_area" d={`${chartPath} L 100 100 L 0 100 Z`} />
                    <path className="chart_line" d={chartPath} />
                  </svg>
                </div>
              ) : (
                <div className="empty_chart_state">Solve a few attempts to draw your progress chart.</div>
              )}
            </div>
          </section>
        );
        } else {
          const latestSessionTime =
          recentSolves.length && recentSolves[0].time_solve
            ? this.convert_sec_to_format(recentSolves[0].time_solve)
            : "--";
        mainView = (
          <section className="sessions_screen view_panel">
            <div className="section_header">
              <div>
                <div className="placeholder_title">Session Dashboard</div>
                <div className="placeholder_text">{currentView.body}</div>
              </div>
              <button
                type="button"
                className="session_create_button"
                onClick={this.startNewSession}
              >
                Start New Session
              </button>
            </div>
            <div className="session_hero">
              <div className="session_hero_main">
                <div className="placeholder_eyebrow">Current Training Block</div>
                <div className="session_hero_title">
                  {activeSession ? activeSession.name : "3x3 BLD"}
                </div>
                <div className="session_hero_text">
                  {sessionCount
                    ? `${sessionCount} solves logged in the active session.`
                    : "No solves logged yet."}
                </div>
              </div>
              <div className="session_hero_stats">
                <div>
                  <span>PB</span>
                  <strong>
                    {activeSessionSummary.bestSingle === null
                      ? "--"
                      : this.convert_sec_to_format(activeSessionSummary.bestSingle)}
                  </strong>
                </div>
                <div>
                  <span>Success</span>
                  <strong>{activeSessionSummary.successText}</strong>
                </div>
              </div>
            </div>
            <div className="session_cards">
              <article className="session_card">
                <div>
                  <div className="session_card_title">Active Session</div>
                  <div className="session_card_subtitle">
                    {activeSession ? activeSession.name : "No active session"}
                  </div>
                </div>
                <div className="session_card_value">{sessionCount} solves</div>
              </article>
              <article className="session_card">
                <div>
                  <div className="session_card_title">Saved Sessions</div>
                  <div className="session_card_subtitle">
                    {sessions.length ? `${sessions.length} available locally` : "No sessions yet"}
                  </div>
                </div>
                <div className="session_card_value">Current {activeSession ? sessions.findIndex((session) => session.id === activeSession.id) + 1 : "--"}</div>
              </article>
              <article className="session_card">
                <div>
                  <div className="session_card_title">Latest Attempt</div>
                  <div className="session_card_subtitle">
                    {recentSolves[0] ? formatDate(recentSolves[0].date) : "No solves yet"}
                  </div>
                </div>
                <div className="session_card_value">{latestSessionTime}</div>
              </article>
              <article className="session_card">
                <div>
                  <div className="session_card_title">Memo Average</div>
                  <div className="session_card_subtitle">Current session</div>
                </div>
                <div className="session_card_value">{memoText}</div>
              </article>
            </div>
            <div className="session_recent_block">
              <div className="chart_card_header">
                <div className="chart_card_title">Saved Sessions</div>
                <div className="section_meta">{sessions.length} total</div>
              </div>
              <div className="session_recent_list">
                {sessions.length ? (
                  sessions.slice(0, 12).map((session, index) => {
                    const summary = this.getSessionSummary(session);
                    const latestSolve = summary.latest;

                    return (
                    <div
                      key={session.id || index}
                      className="session_recent_row"
                      role="button"
                      tabIndex="0"
                      onClick={() => this.activateSession(session.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          this.activateSession(session.id);
                        }
                      }}
                    >
                      <span>{session.id === this.state.activeSessionId ? "Active" : `#${sessions.length - index}`}</span>
                      <strong>
                        {session.name}
                      </strong>
                      <span>
                        {latestSolve
                          ? this.convert_sec_to_format(latestSolve.time_solve)
                          : `${summary.count} solves`}
                      </span>
                    </div>
                    );
                  })
                ) : (
                  <div className="empty_chart_state">New sessions will show up here once you create them.</div>
                )}
              </div>
            </div>
          </section>
        );
      }
    } else {
      mainView = (
        <section className="solve_screen">
          <div className="timer_stage">
            <Timer
              scramble={this.state.scramble}
              solve_status={this.state.solve_status}
              displayTimeMs={timerDisplayMs}
              onStart={(timer_start) => this.handle_onStart_timer(timer_start)}
              onStop={(timer_finish) => this.handle_onStop_timer(timer_finish)}
              minStopDelayMs={350}
              footer={
                <div className="solve_metrics">
                  <div className="split_metric">
                    <div className="split_metric_label">Memo</div>
                    <div className="split_metric_value">{memoText}</div>
                  </div>
                  <div className="split_metric_divider"></div>
                  <div className="split_metric">
                    <div className="split_metric_label">Exec</div>
                    <div className="split_metric_value">{execText}</div>
                  </div>
                  <div className="split_metric_divider"></div>
                  <div className="split_metric">
                    <div className="split_metric_label">Ao5</div>
                    <div className="split_metric_value">{ao5Text}</div>
                  </div>
                  <div className="split_metric_divider"></div>
                  <div className="split_metric">
                    <div className="split_metric_label">Accuracy</div>
                    <div className="split_metric_value">{accuracyText}</div>
                  </div>
                </div>
              }
            />
          </div>

          <div className="last_solve_block">
            <div className="last_solve_heading">Last Solve</div>
            <div className="last_solve_panel">
              {latestSolve ? (
                <React.Fragment>
                  <div className="last_solve_metrics">
                    {lastSolvePanelData.metrics.map((metric) => (
                      <div key={metric.label} className="last_solve_metric">
                        <div className="split_metric_label">{metric.label}</div>
                        <div className="split_metric_value">{metric.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="last_solve_summary">
                    {lastSolvePanelData.lines.map((line) => (
                      <div key={line.label} className="last_solve_comm_line">
                        <span className="last_solve_comm_label">{line.label}:</span>
                        <span className="last_solve_comm_value">{line.value}</span>
                      </div>
                    ))}
                  </div>
                </React.Fragment>
              ) : (
                <div className="last_solve_summary">
                  Your latest comms will appear here.
                </div>
              )}
            </div>
          </div>

        </section>
      );
    }

    return (
      <React.Fragment>
        <div className="application">
          <Helmet id="background_page"></Helmet>
        </div>
        <div className="app_shell">
          <div className="app_frame">
            <header className="app_header">
              <button
                type="button"
                className="icon_button"
                aria-label="Open menu"
                onClick={() => this.setState({ showMenu: true })}
              >
                <span className="icon_menu">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </button>
              <div className="header_title_group">
                <div className="header_title">{currentView.title}</div>
              </div>
              <button
                type="button"
                className="icon_button"
                aria-label="Open settings"
                onClick={() => this.setState({ showSettings: true })}
              >
                <span className="icon_gear"></span>
              </button>
            </header>

            {this.state.activeView === "solve" ? (
              <div
                className="scramble_block"
                onClick={this.copyScramble}
                role="button"
                tabIndex="0"
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    this.copyScramble();
                  }
                }}
              >
                <div className="scramble_label">Scramble</div>
                <div className="scramble_value">{this.state.scramble}</div>
                {this.state.connectionNotice ? (
                  <div className="connection_notice connection_notice_floating" role="alert">
                    <div className="connection_notice_text">{this.state.connectionNotice}</div>
                    <button
                      type="button"
                      className="connection_notice_close"
                      aria-label="Dismiss notice"
                      onClick={(event) => {
                        event.stopPropagation();
                        this.dismissConnectionNotice();
                      }}
                    >
                      x
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <main
              className={`main_view ${
                this.state.activeView === "solve" ? "main_view_solve" : "main_view_page"
              }`}
            >
              {mainView}
            </main>

            <nav className="bottom_nav" aria-label="Primary">
              <button
                type="button"
                className={`nav_item ${this.state.activeView === "solve" ? "nav_item_active" : ""}`}
                onClick={() => this.setState({ activeView: "solve" })}
              >
                <span className="nav_icon nav_icon_solve"></span>
                <span className="nav_label">Solve</span>
              </button>
              <button
                type="button"
                className={`nav_item ${this.state.activeView === "history" ? "nav_item_active" : ""}`}
                onClick={() => this.setState({ activeView: "history" })}
              >
                <span className="nav_icon nav_icon_history"></span>
                <span className="nav_label">History</span>
              </button>
              <button
                type="button"
                className={`nav_item ${this.state.activeView === "stats" ? "nav_item_active" : ""}`}
                onClick={() => this.setState({ activeView: "stats" })}
              >
                <span className="nav_icon nav_icon_stats"></span>
                <span className="nav_label">Stats</span>
              </button>
              <button
                type="button"
                className={`nav_item ${this.state.activeView === "sessions" ? "nav_item_active" : ""}`}
                onClick={() => this.setState({ activeView: "sessions" })}
              >
                <span className="nav_icon nav_icon_sessions"></span>
                <span className="nav_label">Sessions</span>
              </button>
            </nav>
          </div>
        </div>

        {this.state.showMenu ? (
          <div
            className="solve_modal_backdrop"
            onClick={() => this.setState({ showMenu: false })}
          >
            <div className="menu_overlay" onClick={(event) => event.stopPropagation()}>
              <div className="solve_modal_header">
                <div>
                  <div className="section_label">Menu</div>
                  <div className="solve_modal_title">Navigate and connect</div>
                </div>
                <button
                  type="button"
                  className="solve_modal_close"
                  aria-label="Close menu"
                  onClick={() => this.setState({ showMenu: false })}
                >
                  ×
                </button>
              </div>

              <div className="menu_list">
                <button
                  type="button"
                  className="menu_item menu_item_primary"
                  onClick={() => this.setState({ showMenu: false }, this.connectGanCubeDirect)}
                >
                  Connect cube
                </button>
                <button
                  type="button"
                  className="menu_item"
                  onClick={() => this.setState({ showMenu: false, activeView: "solve" })}
                >
                  Solve
                </button>
                <button
                  type="button"
                  className="menu_item"
                  onClick={() => this.setState({ showMenu: false, activeView: "study" })}
                >
                  Study
                </button>
                <button
                  type="button"
                  className="menu_item"
                  onClick={() => this.setState({ showMenu: false, activeView: "drill" })}
                >
                  Drill
                </button>
                <button
                  type="button"
                  className="menu_item"
                  onClick={() => this.setState({ showMenu: false, showSettings: true })}
                >
                  Settings
                </button>
                <button
                  type="button"
                  className="menu_item"
                  onClick={this.resetLocalAppData}
                >
                  Reset Local Data
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {this.state.showSettings ? (
          <div
            className="solve_modal_backdrop"
            onClick={() => this.setState({ showSettings: false })}
          >
            <div className="settings_overlay" onClick={(event) => event.stopPropagation()}>
              <div className="solve_modal_header">
                <div>
                  <div className="section_label">Settings</div>
                  <div className="solve_modal_title">Settings</div>
                </div>
                <button
                  type="button"
                  className="solve_modal_close"
                  aria-label="Close settings"
                  onClick={() => this.setState({ showSettings: false })}
                >
                  ×
                </button>
              </div>
              <Setting
                embedded
                cur_setting={this.state.parse_settings}
                export_setting={this.handle_export_setting}
                id={this.state.parse_settings["ID"]}
                onManageCube={this.connectGanCubeDirect}
                onDisconnectCube={this.handle_disconnect_cube}
                onResetCube={this.handle_reset_cube}
              />
            </div>
          </div>
        ) : null}

        {this.state.showLastSolveDetails ? (
          <div
            className="solve_modal_backdrop solve_modal_backdrop_top"
            onClick={() =>
              this.setState({
                showLastSolveDetails: false,
                loadingSolveDetails: false,
                selectedSolveDetails: null,
              })
            }
          >
            <div className="solve_modal" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="solve_modal_close solve_modal_close_corner"
                aria-label="Close solve details"
                onClick={() =>
                  this.setState({
                    showLastSolveDetails: false,
                    loadingSolveDetails: false,
                    selectedSolveDetails: null,
                  })
                }
              >
                x
              </button>
              {selectedSolveDetailsData ? (
                <React.Fragment>
                  <div className="solve_details_header">
                    <div>
                      <div className="solve_modal_title">{selectedSolveDetailsData.title}</div>
                      <div className="solve_details_date">{selectedSolveDetailsData.date}</div>
                    </div>
                    {selectedSolveDetailsData.link ? (
                      <a
                        className="cubedb_link_box"
                        href={selectedSolveDetailsData.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        CubeDB
                      </a>
                    ) : (
                      <div className="cubedb_link_box cubedb_link_box_disabled">CubeDB</div>
                    )}
                  </div>
                  <div className="solve_details_metrics">
                    {selectedSolveDetailsData.metrics.map((metric) => (
                      <div key={metric.label} className="solve_details_metric">
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="solve_details_summary">
                    <div className="comm_summary_line">
                      <strong>Edges:</strong> {selectedSolveDetailsData.edgeSummary}
                    </div>
                    <div className="comm_summary_line">
                      <strong>Corners:</strong> {selectedSolveDetailsData.cornerSummary}
                    </div>
                  </div>
                  <div className="solve_reconstruction_box">
                    {selectedSolveDetailsData.edgeRows.length ? (
                      <React.Fragment>
                        <div className="reconstruction_phase_title">Edges:</div>
                        {selectedSolveDetailsData.edgeRows.map((comm, index) => (
                          <div key={`edge-${comm.comm_index || index}`} className="reconstruction_row">
                            <span>{this.compactRepeatedTurns(comm.alg) || "--"}</span>
                            <strong>
                              {comm.label || "--"}
                              {Number.isFinite(comm.duration)
                                ? ` (${this.formatInlineDuration(comm.duration)})`
                                : ""}
                            </strong>
                          </div>
                        ))}
                      </React.Fragment>
                    ) : null}
                    {Number.isFinite(selectedSolveDetailsData.transitionSeconds) ? (
                      <div className="reconstruction_transition">
                        Transition: {this.formatInlineDuration(selectedSolveDetailsData.transitionSeconds)}
                      </div>
                    ) : null}
                    {selectedSolveDetailsData.cornerRows.length ? (
                      <React.Fragment>
                        <div className="reconstruction_phase_title">Corners:</div>
                        {selectedSolveDetailsData.cornerRows.map((comm, index) => (
                          <div key={`corner-${comm.comm_index || index}`} className="reconstruction_row">
                            <span>{this.compactRepeatedTurns(comm.alg) || "--"}</span>
                            <strong>
                              {comm.label || "--"}
                              {Number.isFinite(comm.duration)
                                ? ` (${this.formatInlineDuration(comm.duration)})`
                                : ""}
                            </strong>
                          </div>
                        ))}
                      </React.Fragment>
                    ) : null}
                    {!selectedSolveDetailsData.edgeRows.length &&
                    !selectedSolveDetailsData.cornerRows.length ? (
                      <div className="empty_chart_state">No comm reconstruction available yet.</div>
                    ) : null}
                  </div>
                </React.Fragment>
              ) : null}
            </div>
          </div>
        ) : null}
      </React.Fragment>
    );
  };
  render() {
    return <React.Fragment>{this.desktop_layout()}</React.Fragment>;
  }

  GiikerCube = () => {
    const this_App = this;
    var _device = null;

    var GiikerCube = (function () {
      var _server = null;
      var _chrct = null;

      var UUID_SUFFIX = "-0000-1000-8000-00805f9b34fb";

      var SERVICE_UUID_DATA = "0000aadb" + UUID_SUFFIX;
      var CHRCT_UUID_DATA = "0000aadc" + UUID_SUFFIX;

      var SERVICE_UUID_RW = "0000aaaa" + UUID_SUFFIX;
      var CHRCT_UUID_READ = "0000aaab" + UUID_SUFFIX;
      var CHRCT_UUID_WRITE = "0000aaac" + UUID_SUFFIX;

      var deviceName;

      function init(device) {
        deviceName = device.name.startsWith("Gi") ? "Giiker" : "Mi Smart";
        return device.gatt
          .connect()
          .then(function (server) {
            this_App.handle_solve_status("Ready for scrambling");
            _server = server;
            return server.getPrimaryService(SERVICE_UUID_DATA);
          })
          .then(function (service) {
            return service.getCharacteristic(CHRCT_UUID_DATA);
          })
          .then(function (chrct) {
            _chrct = chrct;
            return _chrct.startNotifications();
          })
          .then(function () {
            return _chrct.readValue();
          })
          .then(function (value) {
            // var initState = parseState(value);
            // if (initState[0] != kernel.getProp("giiSolved", SOLVED_FACELET)) {
            // console.log("here");
            // }

            // 	var rst = kernel.getProp('giiRST');
            // if (rst == 'a' || rst == 'p' && confirm(CONFIRM_GIIRST)) {
            // giikerutil.markSolved();
            // }
            // }
            return _chrct.addEventListener(
              "characteristicvaluechanged",
              onStateChanged
            );
          });
      }

      function onStateChanged(event) {
        var value = event.target.value;
        parseState(value);
      }

      /* var cFacelet = [
        [26, 15, 29],
        [20, 8, 9],
        [18, 38, 6],
        [24, 27, 44],
        [51, 35, 17],
        [45, 11, 2],
        [47, 0, 36],
        [53, 42, 33],
      ];

      var eFacelet = [
        [25, 28],
        [23, 12],
        [19, 7],
        [21, 41],
        [32, 16],
        [5, 10],
        [3, 37],
        [30, 43],
        [52, 34],
        [48, 14],
        [46, 1],
        [50, 39],
      ];
      */
      function toHexVal(value) {
        var raw = [];
        for (var i = 0; i < 20; i++) {
          raw.push(value.getUint8(i));
        }
        if (raw[18] === 0xa7) {
          // decrypt
          var key = [
            176, 81, 104, 224, 86, 137, 237, 119, 38, 26, 193, 161, 210, 126,
            150, 81, 93, 13, 236, 249, 89, 235, 88, 24, 113, 81, 214, 131, 130,
            199, 2, 169, 39, 165, 171, 41,
          ];
          var k1 = (raw[19] >> 4) & 0xf;
          var k2 = raw[19] & 0xf;
          for (i = 0; i < 18; i++) {
            raw[i] += key[i + k1] + key[i + k2];
          }
          raw = raw.slice(0, 18);
        }
        var valhex = [];
        for (i = 0; i < raw.length; i++) {
          valhex.push((raw[i] >> 4) & 0xf);
          valhex.push(raw[i] & 0xf);
        }
        return valhex;
      }

      function parseState(value) {
        // var timestamp = Date.now();

        var valhex = toHexVal(value);
        var eo = [];
        for (var i = 0; i < 3; i++) {
          for (var mask = 8; mask !== 0; mask >>= 1) {
            eo.push(valhex[i + 28] & mask ? 1 : 0);
          }
        }

        // var cc = new mathlib.CubieCube();
        // var coMask = [-1, 1, -1, 1, 1, -1, 1, -1];
        // for (var i = 0; i < 8; i++) {
        // cc.ca[i] =
        // (valhex[i] - 1) | ((3 + valhex[i + 8] * coMask[i]) % 3 << 3);
        // }
        // for (var i = 0; i < 12; i++) {
        // cc.ea[i] = ((valhex[i + 16] - 1) << 1) | eo[i];
        // }
        // var facelet = cc.toFaceCube(cFacelet, eFacelet);

        var moves = valhex.slice(32, 40);
        var prevMoves = [];
        let new_moves = [];
        let new_moves_time = [];
        for (i = 0; i < moves.length; i += 2) {
          // console.log(
          // "BDLURF".charAt(moves[i] - 1) + " 2'".charAt((moves[i + 1] - 1) % 7)
          // );
          prevMoves.push(
            "BDLURF".charAt(moves[i] - 1) + " 2'".charAt((moves[i + 1] - 1) % 7)
          );
        }
        // prevMoves.reverse();

        if (this_App.state.giiker_prev_moves.length === 0) {
          this_App.setState({ giiker_prev_moves: prevMoves });
        } else {
          let last_moves = [...this_App.state.giiker_prev_moves];
          // console.log("last moves 1", last_moves);
          // console.log("prev_moves", prevMoves);

          for (i = 0; i < 4; i++) {
            let move = prevMoves[i];
            last_moves.unshift(move);
            // console.log("last moves", last_moves);
            // console.log("last_moves_slice", last_moves.slice(0, 4).join(" "));
            // console.log("prevmoves", prevMoves.join(" "));

            if (last_moves.slice(0, 4).join(" ") === prevMoves.join(" ")) {
              // console.log(move);
              new_moves.push(move);
              new_moves_time.push(Date.now());
              break;
            }
          }

          let cube_moves = [...this_App.state.cube_moves];
          let cube_moves_time = [...this_App.state.cube_moves_time];
          if (cube_moves.length === 0) {
            this_App.handle_solve_status("Scrambling");
          }
          if (this_App.state.solve_status === "Memo") {
            this_App.handle_solve_status("Solving");
          }
          for (i = 0; i < new_moves.length; i++) {
            cube_moves.push(new_moves[i]);
            cube_moves_time.push(Date.now());
          }
          this_App.setState({ cube_moves: cube_moves });
          this_App.setState({ cube_moves_time: cube_moves_time });
          this_App.setState({ giiker_prev_moves: prevMoves });
          this_App.handle_moves_to_show(cube_moves);
        }

        // if (DEBUG) {
        // var hexstr = [];
        // for (var i = 0; i < 40; i++) {
        // hexstr.push("0123456789abcdef".charAt(valhex[i]));
        // }
        // console.log("[giiker]", "Raw Data: ", valhex.join(""));
        // console.log('[giiker]', "Current State: ", facelet);
        // console.log('[giiker]', "A Valid Generator: ", scramble_333.genFacelet(facelet));
        // console.log(
        // "[giiker]",
        //  "Previous Moves: ",
        //  prevMoves.reverse().join(" ")
        // );
        // }
        // callback(facelet, prevMoves, timestamp, deviceName);
        // return [facelet, prevMoves];
      }

      function getBatteryLevel() {
        var _service;
        var _read;
        var _resolve;
        var listener = function (event) {
          _resolve([event.target.value.getUint8(1), deviceName]);
          _read.removeEventListener("characteristicvaluechanged", listener);
          _read.stopNotifications();
        };
        return _server
          .getPrimaryService(SERVICE_UUID_RW)
          .then(function (service) {
            _service = service;
            return service.getCharacteristic(CHRCT_UUID_READ);
          })
          .then(function (chrct) {
            _read = chrct;
            return _read.startNotifications();
          })
          .then(function () {
            return _read.addEventListener(
              "characteristicvaluechanged",
              listener
            );
          })
          .then(function () {
            return _service.getCharacteristic(CHRCT_UUID_WRITE);
          })
          .then(function (chrct) {
            chrct.writeValue(new Uint8Array([0xb5]).buffer);
            return new Promise(function (resolve) {
              _resolve = resolve;
            });
          });
      }

      return {
        init: init,
        opservs: [SERVICE_UUID_DATA, SERVICE_UUID_RW],
        getBatteryLevel: getBatteryLevel,
      };
    })();

    var GanCube = (function () {
      var _server;
      var _service_data;
      var _service_meta;
      var _chrct_f2;
      var _chrct_f5;
      var _chrct_f6;
      var _chrct_f7;

      var UUID_SUFFIX = "-0000-1000-8000-00805f9b34fb";
      var SERVICE_UUID_META = "0000180a" + UUID_SUFFIX;
      var CHRCT_UUID_VERSION = "00002a28" + UUID_SUFFIX;
      var CHRCT_UUID_HARDWARE = "00002a23" + UUID_SUFFIX;
      var SERVICE_UUID_DATA = "0000fff0" + UUID_SUFFIX;
      var CHRCT_UUID_F2 = "0000fff2" + UUID_SUFFIX; // cube state, (54 - 6) facelets, 3 bit per facelet
      // var CHRCT_UUID_F3 = "0000fff3" + UUID_SUFFIX; // prev moves
      var CHRCT_UUID_F5 = "0000fff5" + UUID_SUFFIX; // gyro state, move counter, pre moves
      var CHRCT_UUID_F6 = "0000fff6" + UUID_SUFFIX; // move counter, time offsets between premoves
      var CHRCT_UUID_F7 = "0000fff7" + UUID_SUFFIX;

      var decoder = null;

      var KEYS = [
        "NoRgnAHANATADDWJYwMxQOxiiEcfYgSK6Hpr4TYCs0IG1OEAbDszALpA",
        "NoNg7ANATFIQnARmogLBRUCs0oAYN8U5J45EQBmFADg0oJAOSlUQF0g",
      ];

      function getKey(version, value) {
        var key = KEYS[(version >> 8) & 0xff];
        if (!key) {
          return;
        }
        key = JSON.parse(LZString.decompressFromEncodedURIComponent(key));
        for (var i = 0; i < 6; i++) {
          key[i] = (key[i] + value.getUint8(5 - i)) & 0xff;
        }
        return key;
      }

      function decode(value) {
        var ret = [];
        for (var i = 0; i < value.byteLength; i++) {
          ret[i] = value.getUint8(i);
        }
        if (decoder == null) {
          return ret;
        }
        if (ret.length > 16) {
          ret = ret
            .slice(0, ret.length - 16)
            .concat(decoder.decrypt(ret.slice(ret.length - 16)));
        }
        decoder.decrypt(ret);
        return ret;
      }

      function checkHardware(server) {
        return server
          .getPrimaryService(SERVICE_UUID_META)
          .then(function (service_meta) {
            _service_meta = service_meta;
            return service_meta.getCharacteristic(CHRCT_UUID_VERSION);
          })
          .then(function (chrct) {
            return chrct.readValue();
          })
          .then(function (value) {
            var version =
              (value.getUint8(0) << 16) |
              (value.getUint8(1) << 8) |
              value.getUint8(2);
            // DEBUG && console.log('[gancube] version', JSON.stringify(version));
            decoder = null;
            if (version > 0x010007 && (version & 0xfffe00) === 0x010000) {
              return _service_meta
                .getCharacteristic(CHRCT_UUID_HARDWARE)
                .then(function (chrct) {
                  return chrct.readValue();
                })
                .then(function (value) {
                  var key = getKey(version, value);
                  if (!key) {
                    // logohint.push('Not support your Gan cube');
                    return;
                  }
                  // DEBUG && console.log('[gancube] key', JSON.stringify(key));
                  decoder = new aes128(key);
                });
            } else {
              //not support
              console.log('Gan not supported');
              //logohint.push('Not support your Gan cube');
            }
          })
          .catch(function (err) {
            // If the meta service/characteristic is not available, continue without decoder/encryption.
            console.warn('[gancube] checkHardware failed or meta service not present, continuing without meta:', err);
            decoder = null;
            try {
              this_App.setState({ connectionNotice: 'GAN meta service not present — continuing without meta.' });
            } catch (e) {}
            return Promise.resolve();
          });
      }

      function init(device) {
        return device.gatt
          .connect()
          .then(function (server) {
            _server = server;
            return checkHardware(server);
          })
          .then(function () {
            // Try to get the known GAN data service first, but if it's missing
            // attempt to discover the characteristics across all available services.
            return _server
              .getPrimaryService(SERVICE_UUID_DATA)
              .then(function (service_data) {
                _service_data = service_data;
                return Promise.resolve();
              })
              .catch(function (err) {
                console.warn('[gancube] primary data service not found directly:', err);
                // Try to find a service that exposes the GAN characteristics
                return _server.getPrimaryServices().then(function (services) {
                  var found = false;
                  var seq = Promise.resolve();
                  services.forEach(function (s) {
                    seq = seq.then(function () {
                      if (found) return Promise.resolve();
                      return s.getCharacteristic(CHRCT_UUID_F2).then(function (chr) {
                        _service_data = s;
                        _chrct_f2 = chr;
                        found = true;
                      }).catch(function () {
                        return Promise.resolve();
                      });
                    });
                  });
                  return seq.then(function () {
                    if (found) return Promise.resolve();
                    return Promise.reject(new Error('GAN data characteristics not found on any service'));
                  });
                });
              });
          })
          .then(function () {
            // Ensure we have f2 characteristic. If it wasn't set during discovery,
            // try to obtain it from the chosen service.
            if (!_chrct_f2) {
              return _service_data.getCharacteristic(CHRCT_UUID_F2).then(function (chr) {
                _chrct_f2 = chr;
                return Promise.resolve();
              });
            }
            return Promise.resolve();
          })
          .then(function () {
            // Get remaining characteristics if available; ignore individual failures.
            return _service_data.getCharacteristic(CHRCT_UUID_F5)
              .then(function (chr) {
                _chrct_f5 = chr;
              })
              .catch(function () {
                console.warn('[gancube] CHRCT_UUID_F5 not available on selected service');
              })
              .then(function () {
                return _service_data.getCharacteristic(CHRCT_UUID_F6)
                  .then(function (chr) {
                    _chrct_f6 = chr;
                  })
                  .catch(function () {
                    console.warn('[gancube] CHRCT_UUID_F6 not available on selected service');
                  });
              })
              .then(function () {
                return _service_data.getCharacteristic(CHRCT_UUID_F7)
                  .then(function (chr) {
                    _chrct_f7 = chr;
                  })
                  .catch(function () {
                    console.warn('[gancube] CHRCT_UUID_F7 not available on selected service');
                  });
              });
          })
          .then(function () {
            // Connected and (partially) initialized
            this_App.handle_solve_status("Ready for scrambling");
            this_App.setState({ gan: true });
            return loopRead();
          })
          .catch(function (err) {
            console.warn('[gancube] init failed or required characteristics not found:', err);
            try {
              this_App.setState({ connectionNotice: 'GAN data characteristics not found - BLE unavailable for this device.' });
            } catch (e) {}
            try {
              connectBridge();
            } catch (e) {
              console.error('[gancube] failed to start bridge fallback', e);
            }
            return Promise.resolve();
          });
      }

      var prevMoves;
      // var prevCubie = new mathlib.CubieCube();
      // var curCubie = new mathlib.CubieCube();
      var latestFacelet;
      var timestamp;
      var prevTimestamp = 0;
      var moveCnt = -1;
      var prevMoveCnt = -1;
      var movesFromLastCheck = 1000;

      function checkState() {
        if (movesFromLastCheck < 50) {
          return new Promise(function (resolve) {
            resolve(false);
          });
        }
        return _chrct_f2.readValue().then(function (value) {
          value = decode(value);
          var state = [];
          for (var i = 0; i < value.length - 2; i += 3) {
            var face =
              (value[i ^ 1] << 16) |
              (value[(i + 1) ^ 1] << 8) |
              value[(i + 2) ^ 1];
            for (var j = 21; j >= 0; j -= 3) {
              state.push("URFDLB".charAt((face >> j) & 0x7));
              if (j === 12) {
                state.push("URFDLB".charAt(i / 3));
              }
            }
          }
          latestFacelet = state.join("");
          movesFromLastCheck = 0;
          return new Promise(function (resolve) {
            resolve(true);
          });
        });
      }

      function loopRead() {
        if (!_device) {
          return;
        }
        return _chrct_f5
          .readValue()
          .then(function (value) {
            value = decode(value);
            // timestamp = $.now();
            moveCnt = value[12];
            if (moveCnt === prevMoveCnt) {
              return;
            }
            prevMoves = [];
            for (var i = 0; i < 6; i++) {
              var m = value[13 + i];
              // console.log("URFDLB".charAt(~~(m / 3)) + " 2'".charAt(m % 3));
              prevMoves.unshift(
                "URFDLB".charAt(~~(m / 3)) + " 2'".charAt(m % 3)
              );
            }
            var f6val;
            return _chrct_f6
              .readValue()
              .then(function (value) {
                value = decode(value);
                f6val = value;
                return checkState();
              })
              .then(function (isUpdated) {
                if (isUpdated && prevMoveCnt == -1) {
                  // callback(latestFacelet, prevMoves, timestamp, 'Gan 356i');
                  // prevCubie.fromFacelet(latestFacelet);
                  prevMoveCnt = moveCnt;
                  // if (latestFacelet != kernel.getProp('giiSolved', mathlib.SOLVED_FACELET)) {
                  // var rst = kernel.getProp('giiRST');
                  // if (rst == 'a' || rst == 'p' && confirm(CONFIRM_GIIRST)) {
                  // giikerutil.markSolved();
                  // }
                  // }
                  // return;
                }

                var timeOffs = [];
                for (var i = 0; i < 9; i++) {
                  var off = f6val[i * 2 + 1] | (f6val[i * 2 + 2] << 8);
                  timeOffs.unshift(~~(off / 0.95));
                }

                var moveDiff = (moveCnt - prevMoveCnt) & 0xff;
                prevMoveCnt = moveCnt;
                movesFromLastCheck += moveDiff;
                if (moveDiff > 6) {
                  movesFromLastCheck = 50;
                  moveDiff = 6;
                }
                var _timestamp = prevTimestamp;
                for (var i = moveDiff - 1; i >= 0; i--) {
                  _timestamp += timeOffs[i];
                }
                if (Math.abs(_timestamp - timestamp) > 2000) {
                  console.log(
                    "[gancube]",
                    "time adjust",
                    timestamp - _timestamp,
                    "@",
                    timestamp
                  );
                  prevTimestamp += timestamp - _timestamp;
                }

                let moves = {
                  0: "U",
                  1: "U2",
                  2: "U'",
                  3: "R",
                  4: "R2",
                  5: "R'",
                  6: "F",
                  7: "F2",
                  8: "F'",
                  9: "D",
                  10: "D2",
                  11: "D'",
                  12: "L",
                  13: "L2",
                  14: "L'",
                  15: "B",
                  16: "B2",
                  17: "B'",
                };
                const cube_moves_new = [...this_App.state.cube_moves];
                const cube_moves_time_new = [...this_App.state.cube_moves_time];
                for (var i = moveDiff - 1; i >= 0; i--) {
                  if (cube_moves_new.length === 0) {
                    this_App.handle_solve_status("Scrambling");
                  }
                  if (this_App.state.solve_status == "Memo") {
                    this_App.handle_solve_status("Solving");
                  }
                  var m =
                    "URFDLB".indexOf(prevMoves[i][0]) * 3 +
                    " 2'".indexOf(prevMoves[i][1]);
                  cube_moves_new.push(moves[m]);
                  cube_moves_time_new.push(Date.now());
                  this_App.setState({ cube_moves: cube_moves_new });
                  this_App.setState({ cube_moves_time: cube_moves_time_new });
                  this_App.handle_moves_to_show(cube_moves_new);
                  // mathlib.CubieCube.EdgeMult(prevCubie, mathlib.CubieCube.moveCube[m], curCubie);
                  // mathlib.CubieCube.CornMult(prevCubie, mathlib.CubieCube.moveCube[m], curCubie);
                  prevTimestamp += timeOffs[i];
                  // callback(curCubie.toFaceCube(), prevMoves.slice(i), prevTimestamp, 'Gan 356i');
                  // var tmp = curCubie;
                  // curCubie = prevCubie;
                  // prevCubie = tmp;
                }
                // if (isUpdated && prevCubie.toFaceCube() != latestFacelet) {
                // console.log('[gancube]', 'Cube state check error');
                // console.log('[gancube]', 'calc', prevCubie.toFaceCube());
                // console.log('[gancube]', 'read', latestFacelet);
                // prevCubie.fromFacelet(latestFacelet);
                // }
              });
          })
          .then(loopRead);
      }

      function getBatteryLevel() {
        return _chrct_f7.readValue().then(function (value) {
          value = decode(value);
          return new Promise(function (resolve) {
            resolve([value[7], "Gan 356i"]);
          });
        });
      }

      var aes128 = (function () {
        var Sbox = [
          99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171,
          118, 202, 130, 201, 125, 250, 89, 71, 240, 173, 212, 162, 175, 156,
          164, 114, 192, 183, 253, 147, 38, 54, 63, 247, 204, 52, 165, 229, 241,
          113, 216, 49, 21, 4, 199, 35, 195, 24, 150, 5, 154, 7, 18, 128, 226,
          235, 39, 178, 117, 9, 131, 44, 26, 27, 110, 90, 160, 82, 59, 214, 179,
          41, 227, 47, 132, 83, 209, 0, 237, 32, 252, 177, 91, 106, 203, 190,
          57, 74, 76, 88, 207, 208, 239, 170, 251, 67, 77, 51, 133, 69, 249, 2,
          127, 80, 60, 159, 168, 81, 163, 64, 143, 146, 157, 56, 245, 188, 182,
          218, 33, 16, 255, 243, 210, 205, 12, 19, 236, 95, 151, 68, 23, 196,
          167, 126, 61, 100, 93, 25, 115, 96, 129, 79, 220, 34, 42, 144, 136,
          70, 238, 184, 20, 222, 94, 11, 219, 224, 50, 58, 10, 73, 6, 36, 92,
          194, 211, 172, 98, 145, 149, 228, 121, 231, 200, 55, 109, 141, 213,
          78, 169, 108, 86, 244, 234, 101, 122, 174, 8, 186, 120, 37, 46, 28,
          166, 180, 198, 232, 221, 116, 31, 75, 189, 139, 138, 112, 62, 181,
          102, 72, 3, 246, 14, 97, 53, 87, 185, 134, 193, 29, 158, 225, 248,
          152, 17, 105, 217, 142, 148, 155, 30, 135, 233, 206, 85, 40, 223, 140,
          161, 137, 13, 191, 230, 66, 104, 65, 153, 45, 15, 176, 84, 187, 22,
        ];
        var SboxI = [];
        var ShiftTabI = [0, 13, 10, 7, 4, 1, 14, 11, 8, 5, 2, 15, 12, 9, 6, 3];
        var xtime = [];

        function addRoundKey(state, rkey) {
          for (var i = 0; i < 16; i++) {
            state[i] ^= rkey[i];
          }
        }

        function shiftSubAdd(state, rkey) {
          var state0 = state.slice();
          for (var i = 0; i < 16; i++) {
            state[i] = SboxI[state0[ShiftTabI[i]]] ^ rkey[i];
          }
        }

        function mixColumnsInv(state) {
          for (var i = 0; i < 16; i += 4) {
            var s0 = state[i + 0];
            var s1 = state[i + 1];
            var s2 = state[i + 2];
            var s3 = state[i + 3];
            var h = s0 ^ s1 ^ s2 ^ s3;
            var xh = xtime[h];
            var h1 = xtime[xtime[xh ^ s0 ^ s2]] ^ h;
            var h2 = xtime[xtime[xh ^ s1 ^ s3]] ^ h;
            state[i + 0] ^= h1 ^ xtime[s0 ^ s1];
            state[i + 1] ^= h2 ^ xtime[s1 ^ s2];
            state[i + 2] ^= h1 ^ xtime[s2 ^ s3];
            state[i + 3] ^= h2 ^ xtime[s3 ^ s0];
          }
        }

        function init() {
          if (xtime.length != 0) {
            return;
          }
          for (var i = 0; i < 256; i++) {
            SboxI[Sbox[i]] = i;
          }
          for (var i = 0; i < 128; i++) {
            xtime[i] = i << 1;
            xtime[128 + i] = (i << 1) ^ 0x1b;
          }
        }

        function AES128(key) {
          init();
          var exKey = key.slice();
          var Rcon = 1;
          for (var i = 16; i < 176; i += 4) {
            var tmp = exKey.slice(i - 4, i);
            if (i % 16 == 0) {
              tmp = [
                Sbox[tmp[1]] ^ Rcon,
                Sbox[tmp[2]],
                Sbox[tmp[3]],
                Sbox[tmp[0]],
              ];
              Rcon = xtime[Rcon];
            }
            for (var j = 0; j < 4; j++) {
              exKey[i + j] = exKey[i + j - 16] ^ tmp[j];
            }
          }
          this.key = exKey;
        }

        AES128.prototype.decrypt = function (block) {
          addRoundKey(block, this.key.slice(160, 176));
          for (var i = 144; i >= 16; i -= 16) {
            shiftSubAdd(block, this.key.slice(i, i + 16));
            mixColumnsInv(block);
          }
          shiftSubAdd(block, this.key.slice(0, 16));
          return block;
        };

        return AES128;
      })();

      return {
        init: init,
        opservs: [SERVICE_UUID_DATA, SERVICE_UUID_META],
        getBatteryLevel: getBatteryLevel,
      };
    })();
    var GoCube = (function () {
      var _server;
      var _service;
      var _read;
      var _write;

      var UUID_SUFFIX = "-b5a3-f393-e0a9-e50e24dcca9e";
      var SERVICE_UUID = "6e400001" + UUID_SUFFIX;
      var CHRCT_UUID_WRITE = "6e400002" + UUID_SUFFIX;
      var CHRCT_UUID_READ = "6e400003" + UUID_SUFFIX;

      var WRITE_BATTERY = 50;
      var WRITE_STATE = 51;

      function init(device) {
        return device.gatt
          .connect()
          .then(function (server) {
            this_App.handle_solve_status("Ready for scrambling");
            _server = server;
            return server.getPrimaryService(SERVICE_UUID);
          })
          .then(function (service) {
            _service = service;
            return _service.getCharacteristic(CHRCT_UUID_WRITE);
          })
          .then(function (chrct) {
            _write = chrct;
            return _service.getCharacteristic(CHRCT_UUID_READ);
          })
          .then(function (chrct) {
            _read = chrct;
            return _read.startNotifications();
          })
          .then(function () {
            return _read.addEventListener(
              "characteristicvaluechanged",
              onStateChanged
            );
          })
          .then(function () {
            return _write.writeValue(new Uint8Array([WRITE_STATE]).buffer);
          });
      }

      function onStateChanged(event) {
        var value = event.target.value;
        parseData(value);
      }
      function reset_cube() {
        return _write
          .writeValue(new Uint8Array([WRITE_STATE]).buffer)
          .then(console.log("finish"));
      }
      function toHexVal(value) {
        var valhex = [];
        for (var i = 0; i < value.byteLength; i++) {
          valhex.push((value.getUint8(i) >> 4) & 0xf);
          valhex.push(value.getUint8(i) & 0xf);
        }
        return valhex;
      }

      var axisPerm = [5, 2, 0, 3, 1, 4];
      var facePerm = [0, 1, 2, 5, 8, 7, 6, 3];
      var faceOffset = [0, 0, 6, 2, 0, 0];
      var curBatteryLevel = -1;
      var batteryResolveList = [];
      var moveCntFree = 100;

      function parseData(value) {
        if (value.byteLength < 4) {
          return;
        }
        if (
          value.getUint8(0) != 0x2a ||
          value.getUint8(value.byteLength - 2) != 0x0d ||
          value.getUint8(value.byteLength - 1) != 0x0a
        ) {
          return;
        }
        var msgType = value.getUint8(2);
        var msgLen = value.byteLength - 6;
        if (msgType == 1) {
          // move
          // console.log(toHexVal(value));
          for (var i = 0; i < msgLen; i += 2) {
            var axis = axisPerm[value.getUint8(3 + i) >> 1];
            var power = [0, 2][value.getUint8(3 + i) & 1];
            var m = axis * 3 + power;

            const cube_moves_new = [...this_App.state.cube_moves];
            const cube_moves_time_new = [...this_App.state.cube_moves_time];
            if (cube_moves_new.length === 0) {
              this_App.handle_solve_status("Scrambling");
            }
            if (this_App.state.solve_status == "Memo") {
              this_App.handle_solve_status("Solving");
            }
            cube_moves_new.push("URFDLB".charAt(axis) + " 2'".charAt(power));
            cube_moves_time_new.push(Date.now());
            this_App.setState({ cube_moves: cube_moves_new });
            this_App.setState({ cube_moves_time: cube_moves_time_new });
            this_App.handle_moves_to_show(cube_moves_new);

            // console.log(this_App.state.cube_moves.join(" "));
            // document.getElementById("moves_print").textContent = this.state.cube_moves.join(' ')
          }
        } else if (msgType === 2) {
          // cube state
          var facelet = [];
          for (var a = 0; a < 6; a++) {
            var axis = axisPerm[a] * 9;
            var aoff = faceOffset[a];
            facelet[axis + 4] = "BFUDRL".charAt(value.getUint8(3 + a * 9));
            for (var i = 0; i < 8; i++) {
              facelet[axis + facePerm[(i + aoff) % 8]] = "BFUDRL".charAt(
                value.getUint8(3 + a * 9 + i + 1)
              );
            }
          }
          var newFacelet = facelet.join("");
          // if (newFacelet != curFacelet) {
          //     console.log('facelet', newFacelet);
          //
          // }
        } else if (msgType === 3) {
          // quaternion
        } else if (msgType === 5) {
          // battery level
          console.log("battery level", toHexVal(value));
          curBatteryLevel = value.getUint8(3);
          while (batteryResolveList.length !== 0) {
            batteryResolveList.shift()(curBatteryLevel);
          }
        } else if (msgType === 7) {
          // offline stats
          console.log("offline stats", toHexVal(value));
        } else if (msgType === 8) {
          // cube type
          console.log("cube type", toHexVal(value));
        }
      }

      function getBatteryLevel() {
        _write.writeValue(new Uint8Array([WRITE_BATTERY]).buffer);
        return new Promise(function (resolve) {
          batteryResolveList.push(resolve);
        });
      }

      return {
        init: init,
        opservs: [SERVICE_UUID],
        getBatteryLevel: getBatteryLevel,
        reset_cube: reset_cube,
      };
    })();
    var MoyuCube = (function () {
      var _server;
      var _service;
      var _read;
      var _write;
      var _turn;
      var _gyro;
      var _debug;

      var faces_state = { D: 0, L: 0, B: 0, R: 0, F: 0, U: 0 };
      var faces_dict = { 0: "D", 1: "L", 2: "B", 3: "R", 4: "F", 5: "U" };

      var UUID_SUFFIX = "-0000-1000-8000-00805f9b34fb";
      var SERVICE_UUID = "00001000" + UUID_SUFFIX;
      var TURN_CHRCT = "00001003" + UUID_SUFFIX;
      var GYRO_CHRCT = "00001004" + UUID_SUFFIX;
      var DEBUG_CHRCT = "00001005" + UUID_SUFFIX;
      var WRITE_CHRCT = "00001001" + UUID_SUFFIX;
      var READ_CHRCT = "00001002" + UUID_SUFFIX;

      function init(device) {
        return device.gatt
          .connect()
          .then(function (server) {
            _server = server;
            return _server.getPrimaryService(SERVICE_UUID);
          })
          .then(function (service) {
            _service = service;
            return _service.getCharacteristic(WRITE_CHRCT);
          })
          .then(function (chrct) {
            _write = chrct;
            return _service.getCharacteristic(TURN_CHRCT);
          })
          .then(function (chrct) {
            _turn = chrct;
            return _turn.startNotifications();
          })
          .then(function () {
            return _turn.addEventListener(
              "characteristicvaluechanged",
              onStateChangedTurn
            );
          })
          .then(function (chrct) {
            _gyro = chrct;
            return _service.getCharacteristic(GYRO_CHRCT);
          })
          .then(function (chrct) {
            _gyro = chrct;
            return _gyro.startNotifications();
          })
          .then(function () {
            return _gyro.addEventListener(
              "characteristicvaluechanged",
              onStateChangedGyro
            );
          })
          .then(function (chrct) {
            _read = chrct;
            return _service.getCharacteristic(READ_CHRCT);
          })
          .then(function (chrct) {
            _read = chrct;
            return _read.startNotifications();
          })
          .then(function () {
            this_App.handle_solve_status("Ready for scrambling");
            return _read.addEventListener(
              "characteristicvaluechanged",
              onStateChangedRead
            );
          })

          .then(function (chrct) {
            _debug = chrct;
            return _service.getCharacteristic(DEBUG_CHRCT);
          })
          .then(function (chrct) {
            _debug = chrct;
            return _debug.startNotifications();
          })
          .then(function () {
            return _debug.addEventListener(
              "characteristicvaluechanged",
              onStateChangedDebug
            );
          })

          .then(function () {
            // var write_value = new Uint8Array([10 | 1 << 4 | 0 << 5]).buffer;
            // _write.
            // return _write.writeValue(write_value).then(console.log("finish"));
            // var write_value = new Uint8Array([10 | (0 << 4) | (1 << 5)]).buffer;
            // console.log(write_value);
            // return _write.writeValue(write_value).then(console.log("finish"));
          });
      }
      function onStateChanged(event) {
        var value = event.target.value;
        parseData(value);
      }
      function onStateChangedTurn(event) {
        var value = event.target.value;
        // console.log("turn");
        parseTurns(value);
      }
      function onStateChangedRead(event) {
        var value = event.target.value;
        console.log("read");
        var array = new Uint8Array(value.buffer);
        console.log(array);
      }
      function onStateChangedGyro(event) {
        var value = event.target.value;
        // console.log("gyro");
        // console.log(value);
      }
      function onStateChangedDebug(event) {
        var value = event.target.value;
        // console.log("debug");
        // console.log(value);
      }

      // function reset_cube() {
      //   return _write
      //     .writeValue(new Uint8Array([WRITE_STATE]).buffer)
      //     .then(console.log("finish"));
      // }
      function newMoves(face_turned) {
        const cube_moves_new = [...this_App.state.cube_moves];
        const cube_moves_time_new = [...this_App.state.cube_moves_time];
        if (cube_moves_new.length === 0) {
          this_App.handle_solve_status("Scrambling");
        }
        if (this_App.state.solve_status == "Memo") {
          this_App.handle_solve_status("Solving");
        }
        var move_applied;
        if (faces_state[face_turned] == 90) {
          move_applied = face_turned;
          faces_state[face_turned] = 0;
        } else if (faces_state[face_turned] == -90) {
          move_applied = face_turned + "'";
          faces_state[face_turned] = 0;
        }
        cube_moves_new.push(move_applied);
        cube_moves_time_new.push(Date.now());
        this_App.setState({ cube_moves: cube_moves_new });
        this_App.setState({ cube_moves_time: cube_moves_time_new });
        this_App.handle_moves_to_show(cube_moves_new);
      }

      function parseTurns(value) {
        var array = new Uint8Array(value.buffer);
        var number_of_turns = array[0];
        var face_turned;
        var turn_direction;
        for (var i = 0; i < number_of_turns; i++) {
          face_turned = faces_dict[array[5 + i * 6]];
          turn_direction = array[6 + i * 6] == 220 ? -10 : 10;
          faces_state[face_turned] += turn_direction;
          if (faces_state[face_turned] % 90 == 0) {
            newMoves(face_turned);
          }
        }
      }

      function parseData(value) {
        const cube_moves_new = [...this_App.state.cube_moves];
        const cube_moves_time_new = [...this_App.state.cube_moves_time];
        if (cube_moves_new.length === 0) {
          this_App.handle_solve_status("Scrambling");
        }
        if (this_App.state.solve_status == "Memo") {
          this_App.handle_solve_status("Solving");
        }
        // cube_moves_new.push("URFDLB".charAt(axis) + " 2'".charAt(power));
        cube_moves_time_new.push(Date.now());
        this_App.setState({ cube_moves: cube_moves_new });
        this_App.setState({ cube_moves_time: cube_moves_time_new });
        this_App.handle_moves_to_show(cube_moves_new);

        // console.log(this_App.state.cube_moves.join(" "));
        // document.getElementById("moves_print").textContent = this.state.cube_moves.join(' ')
      }

      return {
        init: init,
        opservs: [SERVICE_UUID],
        // reset_cube: reset_cube,
      };
    })();
    function init() {
      return this_App.connectGanCubeDirect();
    }

    function newMovesNotation(move) {
      console.log("[jbld] newMovesNotation", move);
        const cube_moves_new = [...this_App.state.cube_moves];
        const cube_moves_time_new = [...this_App.state.cube_moves_time];

        if (cube_moves_new.length === 0) {
          this_App.handle_solve_status("Scrambling");
        }
        if (this_App.state.solve_status == "Memo") {
          this_App.handle_solve_status("Solving");
        }

        cube_moves_new.push(move);
        cube_moves_time_new.push(Date.now());

        this_App.setState({ cube_moves: cube_moves_new });
        this_App.setState({ cube_moves_time: cube_moves_time_new });
        this_App.handle_moves_to_show(cube_moves_new);
    }

    function connectBridge() {
        const ws = new WebSocket(`ws://host.docker.internal:17433`);

        ws.onmessage = (e) => {
          console.log("[bridge] raw", e.data);

          let msg;
          try {
            msg = JSON.parse(e.data);
          } catch {
            console.log("[bridge] non-json message");
            return;
          }

          console.log("[bridge] parsed", msg);

          if (msg.type === "move") {
            console.log("[bridge] applying move", msg.move);
            newMovesNotation(msg.move); // no R2 expansion for now
          }
        };


        console.log("[bridge] trying", `ws://${window.location.hostname}:17433`);
        ws.onopen = () => console.log("[bridge] connected");
        ws.onclose = () => console.log("[bridge] closed");
        ws.onerror = (e) => console.log("[bridge] error", e);


        ws.onopen = () => {
          console.log("[bridge] connected");
          this_App.handle_solve_status("Connected");
        };

        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === "move") {
            const m = msg.move;

            // Handle double turns like "R2" by pushing twice
            if (m && m.endsWith("2")) {
              const base = m.slice(0, -1); // "R", "U'", etc (usually no prime with 2, but safe)
              newMovesNotation(base);
              newMovesNotation(base);
            } else {
              newMovesNotation(m);
            }
          }
        };

        ws.onclose = () => console.log("[bridge] closed");
        ws.onerror = (err) => console.log("[bridge] error", err);

        return ws;
    }

    init();
  };
}
export default App;

