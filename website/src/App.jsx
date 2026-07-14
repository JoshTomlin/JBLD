import React from "react";
import cubeSolver from "cube-solver";
import { Alg, Move } from "cubing/alg";
import { countMoves } from "cubing/notation";
import { KPuzzle } from "cubing/kpuzzle";
import { experimentalCube3x3x3KPuzzle } from "cubing/puzzles";
import { connectGanCube } from "gan-web-bluetooth";
import Setting from "./component/Settings";
import "bootstrap/dist/css/bootstrap.css";
import Timer from "./component/Timer";
import { Helmet } from "react-helmet";
import { buildSolveAnalysis } from "./utils/bldParser";
import { buildLocalCommAnalysis, normalizeForOrientation } from "./utils/localCommParser";
import { buildLocalSolveResult } from "./utils/localSolveParser";
import { buildRecommendedSolve } from "./utils/solveRecommender";
import { computeSessionAggregateStats, isDnfValue } from "./utils/solveAverages";
import { extractRecordedSolveData } from "./utils/extractRecordedSolve";
import { expandCommNotation, hasCommNotation } from "./utils/commNotation";
import {
  fetchSupabaseDataset,
  fetchSupabaseSolveById,
  isSupabaseConfigured,
  syncSupabaseDataset,
} from "./utils/supabaseSync";
import {
  bootstrapLegacyStorageIntoDatabase,
  getAlgLibraryEntries,
  getAlgLibraryEntriesForCases,
  getAlgLibrarySummary,
  importAlgLibraryEntries,
  getLocalAppMetaValue,
  getLocalDatabaseSummary,
  loadDatasetFromDatabase,
  persistDatasetToDatabase,
  queryLocalDatabase,
  replaceBundledAlgLibraryEntries,
  setLocalAppMetaValue,
  updateAlgLibraryEntry,
} from "./utils/localDatabase";
import { getBundledAlgLibraryEntries } from "./data/bundledAlgLibrary";
import { APP_LAST_UPDATED_LABEL } from "./buildMeta";

import LZString from "lz-string";
import "react-base-table/styles.css";

const BUNDLED_ALG_LIBRARY_VERSION = "2026-06-19-v5";
const FULL_SESSION_LOCAL_STORAGE_SOLVE_LIMIT = 250;
const FULL_SESSION_LOCAL_STORAGE_CHAR_LIMIT = 2500000;
const PRACTICE_LOCAL_STORAGE_SOLVE_LIMIT = 300;
const ALG_REVIEW_CUBE_DEFINITION = experimentalCube3x3x3KPuzzle;

class App extends React.Component {
  constructor() {
    super();
    this.GiikerCube = this.GiikerCube.bind(this);
    this.connectGanCubeDirect = this.connectGanCubeDirect.bind(this);
    this.newMovesNotation = this.newMovesNotation.bind(this);
    this.backupImportInputRef = React.createRef();
    this.deferredInstallPrompt = null;
    this.localDatabaseWritePromise = Promise.resolve();
    this.sessionStorageCache = null;
    this.algReviewTargetSignatureCache = new Map();
    this.algReviewAttemptCube = null;
    this.algReviewAttemptMoves = [];
    this.drillProcessedMoveCount = 0;
    this.solveRecommendationRequestId = 0;
    this.state = {
      activeView: "solve",
      showMenu: false,
      showSettings: false,
      showLastSolveDetails: false,
      loadingSolveDetails: false,
      loadingSolveDetailsCommLibrary: false,
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
      algLibrarySummary: { counts: [], recentEntries: [] },
      algLibraryAllEntries: [],
      algLibraryEntries: [],
      algLibraryEntryTotal: 0,
      algLibrarySelectedEntryId: null,
      algLibraryDraft: null,
      algLibrarySearch: "",
      algLibraryPieceType: "all",
      algLibraryGroup: "all",
      algLibraryTab: "search",
      algLibraryEditing: false,
      algLibraryLoadingEntries: false,
      algLibrarySavingEntry: false,
      algLibraryRecentMatches: [],
      algLibraryImporting: false,
      algLibraryNotice: null,
      drillMode: "memo-flow",
      drillPieceTypes: ["corner"],
      drillDisplayMode: "next",
      drillLoading: false,
      drillSessionActive: false,
      drillQueue: [],
      drillCurrentIndex: 0,
      drillCurrentEntry: null,
      drillNextEntry: null,
      drillExecutingEntry: null,
      drillExecutionStartIndex: null,
      drillProcessedMoveCount: 0,
      drillStatusMessage: "",
      drillCompletedCount: 0,
      drillSkippedCount: 0,
      drillReviewEntries: [],
      drillCurrentMoves: [],
      drillPromptStartedAt: null,
      drillAttemptStartedAt: null,
      drillCurrentRetryCount: 0,
      algReviewPieceType: "edge",
      algReviewGroup: "all",
      algReviewGroups: [],
      algReviewEntries: [],
      algReviewPeekVisible: false,
      algReviewAttemptRecords: this.parseJsonStorage("algReviewAttemptRecords", []),
      algReviewProgress: this.parseJsonStorage("algReviewProgress", null),
      algReviewEditorEntry: null,
      algReviewEditorDraft: null,
      algReviewEditorSaving: false,
      practiceSolves: this.parseJsonStorage("practiceSolves", []),
      practiceScrambleType: "edges",
      practiceTab: "solve",
      renderTable: null,
      solves_stats: [],
      timer_focus: null,
      moves_to_show: null,
      giiker_prev_moves: [],
      solve_status: "Connect Cube",
      last_scramble: null,
      scramble: null,
      solveScramble: null,
      practiceScramble: null,
      lastSolveScramble: null,
      lastPracticeScramble: null,
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
      solveDetailsDnfCategory: "",
      solveDetailsDnfStage: "",
      solveDetailsLibraryByCase: {},
      solveDetailsCommStatusByKey: {},
      selectedSolveCommCard: null,
      solveCommEditorDraft: null,
      solveCommEditorSaving: false,
      solveRecommendationLoading: false,
      solveRecommendation: null,
      solveRecommendationError: null,
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
    window.addEventListener("online", this.handleNetworkChange);
    window.addEventListener("offline", this.handleNetworkChange);
    window.addEventListener("beforeinstallprompt", this.handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", this.handleAppInstalled);
    this.bootstrapLocalPersistence()
      .catch((error) => {
        console.warn("Local database bootstrap failed, using localStorage cache", error);
      })
      .finally(() => {
        this.initialStatsFromLocalstorage();
        this.sanitizeStoredSolveScrambleType();
        this.handle_scramble("solve");
        this.probeRemoteParserAvailability();
        this.syncSessionsWithCloud().catch((error) => {
          console.warn("Cloud sync bootstrapping failed, using local cache", error);
        });
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
  exportSolveBackup = async () => {
    const { sessions, activeSessionId } = this.ensureSessionStorage();
    const algLibraryResult = await getAlgLibraryEntries({
      pieceType: "all",
      search: "",
      limit: 50000,
    });
    const algLibraryEntries = Array.isArray(algLibraryResult.entries)
      ? algLibraryResult.entries
      : [];
    const exportedAt = new Date().toISOString();
    const payload = {
      version: 2,
      exportedAt,
      appLastUpdated: APP_LAST_UPDATED_LABEL,
      activeSessionId,
      sessions,
      parseSettings: this.state.parse_settings || null,
      algLibrary: {
        version: 1,
        exportedAt,
        totalCount: Number(algLibraryResult.totalCount) || algLibraryEntries.length,
        entries: algLibraryEntries,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `jbld-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);

    this.setState({
      showMenu: false,
      connectionNotice: `Backup exported with ${algLibraryEntries.length} Alg Library entries. Keep the JSON file somewhere safe outside the browser.`,
    });
  };
  triggerSolveBackupImport = () => {
    this.setState({ showMenu: false }, () => {
      if (this.backupImportInputRef.current) {
        this.backupImportInputRef.current.value = "";
        this.backupImportInputRef.current.click();
      }
    });
  };
  importSolveBackup = async (event) => {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      const backup = JSON.parse(rawText);
      const sessions = Array.isArray(backup && backup.sessions) ? backup.sessions : null;
      const activeSessionId = backup ? backup.activeSessionId || null : null;
      const parseSettings = backup && backup.parseSettings && typeof backup.parseSettings === "object"
        ? backup.parseSettings
        : null;
      const algLibraryEntries = Array.isArray(backup && backup.algLibrary && backup.algLibrary.entries)
        ? backup.algLibrary.entries
        : Array.isArray(backup && backup.algLibraryEntries)
          ? backup.algLibraryEntries
          : [];

      if (!sessions || !sessions.length) {
        throw new Error("Backup file does not contain any sessions.");
      }

      if (parseSettings) {
        localStorage.setItem("setting", JSON.stringify(parseSettings));
      }

      if (algLibraryEntries.length) {
        await importAlgLibraryEntries(algLibraryEntries);
      }

      this.persistSessionStorage(sessions, activeSessionId);
      this.setState(
        {
          parse_settings: parseSettings || this.state.parse_settings,
          sessions,
          activeSessionId: this.getActiveSessionFromList(sessions, activeSessionId)
            ? this.getActiveSessionFromList(sessions, activeSessionId).id
            : (sessions[0] && sessions[0].id) || null,
          connectionNotice: `Backup restored from ${file.name}${algLibraryEntries.length ? ` with ${algLibraryEntries.length} Alg Library entries` : ""}.`,
        },
        () => {
          this.initialStatsFromLocalstorage();
          this.refreshAlgLibrarySummary().catch((error) => {
            console.warn("Alg Library summary refresh after backup restore failed", error);
          });
          if (this.state.activeView === "alg-library") {
            this.refreshAlgLibraryEntries({ pieceType: this.state.algLibraryPieceType }).catch((error) => {
              console.warn("Alg Library refresh after backup restore failed", error);
            });
          }
          this.syncSessionsWithCloud(this.state.activeSessionId).catch((error) => {
            console.warn("Cloud sync after backup restore failed", error);
          });
        }
      );
    } catch (error) {
      this.setState({
        connectionNotice:
          error && error.message
            ? `Backup restore failed. ${error.message}`
            : "Backup restore failed.",
      });
    } finally {
      if (event && event.target) {
        event.target.value = "";
      }
    }
  };
  refreshAppWithoutClearingData = async () => {
    try {
      const { sessions, activeSessionId } = this.ensureSessionStorage({ skipDatabaseMirror: true });
      await this.persistLocalDatabaseSnapshot(sessions, activeSessionId);

      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(async (registration) => {
            try {
              await registration.update();
            } catch (_error) {
              // Ignore update failures and continue with unregister below.
            }

            if (registration.waiting) {
              registration.waiting.postMessage({ type: "SKIP_WAITING" });
            }

            await registration.unregister();
          })
        );
      }

      if ("caches" in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
      }

      this.setState({ connectionNotice: "Refreshing app without clearing solve data..." }, () => {
        window.location.reload();
      });
    } catch (error) {
      this.setState({
        connectionNotice:
          error && error.message
            ? `App refresh failed. ${error.message}`
            : "App refresh failed.",
      });
    }
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

  countSessionSolves = (sessions = []) => {
    return (Array.isArray(sessions) ? sessions : []).reduce((total, session) => {
      const solves = session && Array.isArray(session.solves) ? session.solves : [];
      return total + solves.length;
    }, 0);
  };

  buildCompactSessionStorage = (sessions = []) => {
    return (Array.isArray(sessions) ? sessions : []).map((session, index) => {
      const solves = session && Array.isArray(session.solves) ? session.solves : [];
      const latestSolve = solves.length ? solves[solves.length - 1] : null;
      return {
        ...session,
        id: session && session.id ? session.id : `session-restored-${index}`,
        name: session && session.name ? session.name : `Session ${index + 1}`,
        solves: [],
        solveCount: solves.length,
        latestSolveDate: latestSolve
          ? latestSolve.date || latestSolve.recorded_at || latestSolve.updatedAt || null
          : null,
      };
    });
  };

  safeSetStorageString = (key, value, context = key) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`Failed to write ${context} to localStorage`, error);
      return false;
    }
  };

  safeSetJsonStorage = (key, value, context = key) => {
    try {
      return this.safeSetStorageString(key, JSON.stringify(value), context);
    } catch (error) {
      console.warn(`Failed to serialize ${context} for localStorage`, error);
      return false;
    }
  };

  safeRemoveLocalStorageItem = (key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove localStorage key "${key}"`, error);
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

  persistLocalDatabaseSnapshot = (sessions, activeSessionId) => {
    this.localDatabaseWritePromise = this.localDatabaseWritePromise
      .catch(() => null)
      .then(() => persistDatasetToDatabase({ sessions, activeSessionId }))
      .catch((error) => {
        console.warn("Failed to persist local PGlite dataset", error);
      });

    return this.localDatabaseWritePromise;
  };

  bootstrapLocalPersistence = async () => {
    const legacyDataset = this.ensureSessionStorage({ skipDatabaseMirror: true });
    const dataset = await bootstrapLegacyStorageIntoDatabase({
      sessions: legacyDataset.sessions,
      activeSessionId: legacyDataset.activeSessionId,
    });

    if (dataset && Array.isArray(dataset.sessions) && dataset.sessions.length) {
      this.persistSessionStorage(dataset.sessions, dataset.activeSessionId, {
        skipDatabaseMirror: true,
      });
    }

    if (typeof window !== "undefined") {
      window.jbldDbDebug = {
        query: (sql, params = []) => queryLocalDatabase(sql, params),
        summary: () => getLocalDatabaseSummary(),
        loadDataset: () => loadDatasetFromDatabase(),
        refreshLocalCache: () => this.refreshSessionStorageFromDatabase(),
        algLibrarySummary: () => getAlgLibrarySummary(),
      };
    }

    await this.ensureBundledAlgLibraryLoaded();
    return dataset;
  };

  refreshSessionStorageFromDatabase = async () => {
    const dataset = await loadDatasetFromDatabase();
    if (dataset && Array.isArray(dataset.sessions) && dataset.sessions.length) {
      this.persistSessionStorage(dataset.sessions, dataset.activeSessionId, {
        skipDatabaseMirror: true,
      });
    }
    return dataset;
  };

  refreshAlgLibrarySummary = async () => {
    try {
      const algLibrarySummary = await getAlgLibrarySummary();
      this.setState({ algLibrarySummary });
      return algLibrarySummary;
    } catch (error) {
      console.warn("Failed to refresh alg library summary", error);
      return null;
    }
  };

  buildRecentAlgLibraryMatches = async (recentSolves = []) => {
    const recentComms = [];

    recentSolves.forEach((solve) => {
      if (!solve || !Array.isArray(solve.comm_stats)) {
        return;
      }

      solve.comm_stats.forEach((comm, index) => {
        if (!comm || !["edge", "corner", "parity"].includes(comm.phase) || !comm.parse_text) {
          return;
        }

        recentComms.push({
          id: `${solve.id || solve.date || "solve"}-${comm.comm_index || index}`,
          solveId: solve.id || null,
          solveDate: solve.date || null,
          pieceType: comm.phase,
          caseCode: comm.parse_text,
          algUsed: comm.alg || "",
        });
      });
    });

    const uniqueCaseRefs = [];
    const seen = new Set();
    recentComms.forEach((comm) => {
      const key = `${comm.pieceType}:${comm.caseCode}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCaseRefs.push({ pieceType: comm.pieceType, caseCode: comm.caseCode });
      }
    });

    const libraryEntries = await getAlgLibraryEntriesForCases(uniqueCaseRefs);
    const libraryByKey = new Map(
      libraryEntries.map((entry) => [`${entry.piece_type}:${entry.case_code}`, entry])
    );

    return recentComms.slice(0, 12).map((comm) => {
      const matchingEntry = libraryByKey.get(`${comm.pieceType}:${comm.caseCode}`) || null;
      const normalizedUsed = this.normalizeAlgComparisonText(comm.algUsed || "", comm.pieceType);
      const normalizedPreferred = matchingEntry
        ? this.normalizeAlgComparisonText(matchingEntry.alg || "", matchingEntry.piece_type)
        : "";

      return {
        ...comm,
        preferredEntry: matchingEntry,
        status: !matchingEntry
          ? "missing"
          : normalizedUsed && normalizedPreferred && normalizedUsed === normalizedPreferred
            ? "match"
            : "review",
      };
    });
  };

  refreshAlgLibraryEntries = async (options = {}) => {
    const pieceType = options.pieceType || this.state.algLibraryPieceType || "all";

    this.setState({ algLibraryLoadingEntries: true });
    await this.ensureBundledAlgLibraryLoaded({ refreshEntries: false, silent: true });

    const result = await getAlgLibraryEntries({
      pieceType,
      search: "",
      limit: 5000,
    });
    const recentMatches = await this.buildRecentAlgLibraryMatches(
      [...this.state.solves_stats].slice().reverse().slice(0, 8)
    );

    this.setState((currentState) => {
      const allEntries = Array.isArray(result.entries) ? result.entries : [];
      const filteredEntries = this.filterAlgLibraryEntries(allEntries, {
        search: typeof options.search === "string" ? options.search : currentState.algLibrarySearch || "",
        group: typeof options.group === "string" ? options.group : currentState.algLibraryGroup || "all",
      });
      const entries = filteredEntries;
      const existingSelection = entries.find((entry) => entry.id === currentState.algLibrarySelectedEntryId);
      const selectedEntry = existingSelection || entries[0] || null;

      return {
        algLibraryAllEntries: allEntries,
        algLibraryEntries: entries,
        algLibraryEntryTotal: entries.length,
        algLibraryLoadingEntries: false,
        algLibraryRecentMatches: recentMatches,
        algLibrarySelectedEntryId: selectedEntry ? selectedEntry.id : null,
        algLibraryDraft: selectedEntry
          ? {
              description: selectedEntry.description || "",
              alg: selectedEntry.alg || "",
              memoWord: selectedEntry.memo_word || "",
              category: selectedEntry.category || "",
              notes: selectedEntry.notes || "",
            }
          : null,
      };
    });

    return result;
  };

  filterAlgLibraryEntries = (entries = [], options = {}) => {
    const search = typeof options.search === "string" ? options.search.trim().toLowerCase() : "";
    const group = typeof options.group === "string" ? options.group : "all";

    return entries.filter((entry) => {
      const entryGroup = String(entry.category || "").trim();
      if (group !== "all" && entryGroup !== group) {
        return false;
      }

      if (!search) {
        return true;
      }

      const caseCode = String(entry.case_code || "").trim().toLowerCase();
      if (!caseCode) {
        return false;
      }

      if (caseCode.includes(search)) {
        return true;
      }

      return entry.piece_type === "parity" && caseCode.length === 1
        ? search.includes(caseCode)
        : false;
    });
  };

  formatAlgLibraryCategory = (category) => {
    const value = String(category || "").trim();
    if (!value) {
      return "";
    }

    const match = value.match(/^set up to (.+)$/i);
    return match ? `${match[1]} set-up` : value;
  };

  applyAlgLibraryFilters = (options = {}) => {
    this.setState((currentState) => {
      const filteredEntries = this.filterAlgLibraryEntries(currentState.algLibraryAllEntries, {
        search: typeof options.search === "string" ? options.search : currentState.algLibrarySearch || "",
        group: typeof options.group === "string" ? options.group : currentState.algLibraryGroup || "all",
      });
      const existingSelection = filteredEntries.find((entry) => entry.id === currentState.algLibrarySelectedEntryId);
      const selectedEntry = existingSelection || filteredEntries[0] || null;

      return {
        algLibraryEntries: filteredEntries,
        algLibraryEntryTotal: filteredEntries.length,
        algLibrarySelectedEntryId: selectedEntry ? selectedEntry.id : null,
        algLibraryDraft: selectedEntry
          ? {
              description: selectedEntry.description || "",
              alg: selectedEntry.alg || "",
              memoWord: selectedEntry.memo_word || "",
              category: selectedEntry.category || "",
              notes: selectedEntry.notes || "",
            }
          : null,
      };
    });
  };

  selectAlgLibraryEntry = (entry) => {
    this.setState({
      algLibrarySelectedEntryId: entry ? entry.id : null,
      algLibraryEditing: false,
      algLibraryDraft: entry
        ? {
            description: entry.description || "",
            alg: entry.alg || "",
            memoWord: entry.memo_word || "",
            category: entry.category || "",
            notes: entry.notes || "",
          }
        : null,
    });
  };

  updateAlgLibraryDraftField = (field, value) => {
    this.setState((currentState) => ({
      algLibraryDraft: {
        ...(currentState.algLibraryDraft || {}),
        [field]: value,
      },
    }));
  };

  openAlgLibraryEditor = () => {
    if (!this.state.algLibrarySelectedEntryId) {
      return;
    }

    this.setState({ algLibraryEditing: true });
  };

  openAlgLibraryEditorForEntry = (entry) => {
    if (!entry) {
      return;
    }

    this.setState({
      algLibrarySelectedEntryId: entry.id,
      algLibraryEditing: true,
      algLibraryDraft: {
        description: entry.description || "",
        alg: entry.alg || "",
        memoWord: entry.memo_word || "",
        category: entry.category || "",
        notes: entry.notes || "",
      },
    });
  };

  closeAlgLibraryEditor = () => {
    this.setState({ algLibraryEditing: false });
  };

  jumpToAlgLibraryEntry = (entry) => {
    if (!entry) {
      return;
    }

    this.setState({
      activeView: "alg-library",
      algLibraryTab: "search",
      algLibraryPieceType: entry.piece_type || "all",
      algLibrarySearch: entry.case_code || "",
      algLibraryEditing: false,
    });
    this.selectAlgLibraryEntry(entry);
  };

  saveAlgLibraryEntry = async () => {
    const { algLibrarySelectedEntryId, algLibraryDraft } = this.state;
    if (!algLibrarySelectedEntryId || !algLibraryDraft) {
      return;
    }

    this.setState({
      algLibrarySavingEntry: true,
      algLibraryNotice: "Saving Alg Library entry...",
    });

    try {
      const savedEntry = await updateAlgLibraryEntry(algLibrarySelectedEntryId, algLibraryDraft);
      await this.refreshAlgLibrarySummary();
      const recentMatches = await this.buildRecentAlgLibraryMatches(
        [...this.state.solves_stats].slice().reverse().slice(0, 8)
      );
      this.setState((currentState) => ({
        algLibrarySavingEntry: false,
        algLibraryEditing: false,
        algLibraryNotice: `Saved ${savedEntry.case_code} in your local Alg Library.`,
        algLibraryRecentMatches: recentMatches,
        algLibraryEntries: currentState.algLibraryEntries.map((entry) =>
          entry.id === savedEntry.id ? savedEntry : entry
        ),
        algLibraryDraft: {
          description: savedEntry.description || "",
          alg: savedEntry.alg || "",
          memoWord: savedEntry.memo_word || "",
          category: savedEntry.category || "",
          notes: savedEntry.notes || "",
        },
      }));
    } catch (error) {
      this.setState({
        algLibrarySavingEntry: false,
        algLibraryNotice:
          error && error.message ? `Saving failed. ${error.message}` : "Saving failed for this Alg Library entry.",
      });
    }
  };

  ensureBundledAlgLibraryLoaded = async (options = {}) => {
    const { refreshEntries = true, silent = false } = options;
    const summary = await this.refreshAlgLibrarySummary();
    const totalCount = Array.isArray(summary && summary.counts)
      ? summary.counts.reduce((total, entry) => total + (Number(entry.count) || 0), 0)
      : 0;
    const savedSeedVersion = await getLocalAppMetaValue("alg_library_seed_version", null);

    if (totalCount > 0 && savedSeedVersion === BUNDLED_ALG_LIBRARY_VERSION) {
      return summary;
    }

    try {
      const entries = getBundledAlgLibraryEntries();
      await replaceBundledAlgLibraryEntries(entries);
      await setLocalAppMetaValue("alg_library_seed_version", BUNDLED_ALG_LIBRARY_VERSION);
      const nextSummary = await this.refreshAlgLibrarySummary();
      if (refreshEntries && this.state.activeView === "alg-library") {
        await this.refreshAlgLibraryEntries();
      }
      if (!silent) {
        this.setState({
          algLibraryNotice: `Loaded ${entries.length} bundled alg library entries automatically.`,
        });
      }
      return nextSummary;
    } catch (error) {
      console.error("Failed to auto-load bundled alg library", error);
      const reason =
        error && error.message ? error.message : "The bundled alg library could not be loaded.";
      if (!silent) {
        this.setState({
          algLibraryNotice: `Bundled alg library failed to load. ${reason}`,
        });
      }
      return summary;
    }
  };

  persistSessionStorage = (sessions, activeSessionId, options = {}) => {
    const { skipDatabaseMirror = false } = options;
    const activeSession = this.getActiveSessionFromList(sessions, activeSessionId);
    const resolvedActiveSessionId = activeSession ? activeSession.id : activeSessionId;
    const solves = activeSession && Array.isArray(activeSession.solves) ? activeSession.solves : [];

    this.sessionStorageCache = {
      sessions: Array.isArray(sessions) ? sessions : [],
      activeSessionId: resolvedActiveSessionId || null,
    };

    if (!skipDatabaseMirror) {
      this.persistLocalDatabaseSnapshot(sessions, resolvedActiveSessionId);
    }

    const totalSolveCount = this.countSessionSolves(sessions);
    let compactLocalStorage = totalSolveCount > FULL_SESSION_LOCAL_STORAGE_SOLVE_LIMIT;
    let sessionsJson = "";
    let solvesJson = "";

    if (!compactLocalStorage) {
      try {
        sessionsJson = JSON.stringify(sessions);
        solvesJson = JSON.stringify(solves);
        compactLocalStorage =
          sessionsJson.length + solvesJson.length > FULL_SESSION_LOCAL_STORAGE_CHAR_LIMIT;
      } catch (error) {
        console.warn("Failed to serialize sessions for localStorage", error);
        compactLocalStorage = true;
      }
    }

    if (!compactLocalStorage) {
      const sessionsSaved = this.safeSetStorageString("sessions", sessionsJson, "sessions");
      const activeSessionSaved = this.safeSetJsonStorage(
        "activeSessionId",
        resolvedActiveSessionId || null,
        "active session id"
      );
      const solvesSaved = this.safeSetStorageString("solves", solvesJson, "active session solves");

      if (sessionsSaved && activeSessionSaved && solvesSaved) {
        this.safeRemoveLocalStorageItem("sessionsCompacted");
        return;
      }

      compactLocalStorage = true;
    }

    this.safeRemoveLocalStorageItem("sessions");
    this.safeRemoveLocalStorageItem("solves");
    this.safeSetJsonStorage("sessions", this.buildCompactSessionStorage(sessions), "compact sessions");
    this.safeSetJsonStorage("activeSessionId", resolvedActiveSessionId || null, "active session id");
    this.safeSetJsonStorage("solves", [], "legacy active session solves");
    this.safeSetJsonStorage(
      "sessionsCompacted",
      {
        at: new Date().toISOString(),
        totalSolveCount,
      },
      "session compaction marker"
    );
  };
  ensureSessionStorage = (options = {}) => {
    const { skipDatabaseMirror = false } = options;
    const cachedStorage = this.sessionStorageCache;
    const hasCachedSessions =
      cachedStorage && Array.isArray(cachedStorage.sessions) && cachedStorage.sessions.length > 0;
    let sessions = hasCachedSessions ? cachedStorage.sessions : this.parseJsonStorage("sessions", []);
    let activeSessionId = hasCachedSessions
      ? cachedStorage.activeSessionId
      : this.parseJsonStorage("activeSessionId", null);

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

    this.persistSessionStorage(sessions, resolvedActiveSessionId, {
      skipDatabaseMirror,
    });

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
    DNF: isDnfValue(solve && solve.DNF),
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
    const existingReason = solve && typeof solve.dnf_reason === "string" ? solve.dnf_reason.trim() : "";
    let category = "";
    let stage = "";
    const wrongExecMatch = existingReason.match(/^Wrong\s+(Edge|Corner|Parity|Flip|Twist)\s+Exec$/i);
    const forgotMemoMatch = existingReason.match(/^Forgot\s+(Edge|Corner|Parity|Flip|Twist)\s+Memo$/i);
    if (wrongExecMatch) {
      category = "Wrong Exec";
      stage = wrongExecMatch[1];
    } else if (forgotMemoMatch) {
      category = "Forgot Memo";
      stage = forgotMemoMatch[1];
    } else if (/^Wrong Exec$/i.test(existingReason)) {
      category = "Wrong Exec";
    } else if (/^Forgot Memo$/i.test(existingReason)) {
      category = "Forgot Memo";
    }
    this.solveCommEditorDraftBuffer = null;
    this.setState({
      showLastSolveDetails: true,
      historySessionMenuOpen: false,
      loadingSolveDetails: Boolean(solve && solve.id),
      loadingSolveDetailsCommLibrary: false,
      selectedSolveDetails: solve || null,
      solveDetailsDnfCategory: category,
      solveDetailsDnfStage: stage,
      selectedSolveCommCard: null,
      solveCommEditorDraft: null,
      solveCommEditorSaving: false,
      solveDetailsLibraryByCase: {},
      solveDetailsCommStatusByKey: {},
      solveRecommendationLoading: Boolean(solve && solve.scramble),
      solveRecommendation: null,
      solveRecommendationError: null,
      parsed_solve_txt: (solve && solve.txt_solve) || "No parsed solve text available yet.",
    });

    this.loadSolveDetailsCommLibrary(solve);
    this.scheduleSolveRecommendation(solve);

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
        this.loadSolveDetailsCommLibrary(detailedSolve);
        this.scheduleSolveRecommendation(detailedSolve);
      })
      .catch((error) => {
        console.warn("Failed to load solve details from server", error);
        this.setState({ loadingSolveDetails: false });
      });
  };

  scheduleSolveRecommendation = (solve) => {
    const requestId = this.solveRecommendationRequestId + 1;
    this.solveRecommendationRequestId = requestId;

    if (!solve || !solve.scramble) {
      this.setState({
        solveRecommendationLoading: false,
        solveRecommendation: null,
        solveRecommendationError: "No scramble saved for this solve.",
      });
      return;
    }

    const parseSettings = { ...this.state.parse_settings };
    this.setState({
      solveRecommendationLoading: true,
      solveRecommendation: null,
      solveRecommendationError: null,
    });

    const schedule = typeof window !== "undefined" && window.setTimeout ? window.setTimeout : setTimeout;
    schedule(() => {
      try {
        const recommendation = buildRecommendedSolve(solve, parseSettings);
        if (requestId !== this.solveRecommendationRequestId) {
          return;
        }
        this.setState({
          solveRecommendationLoading: false,
          solveRecommendation: recommendation,
          solveRecommendationError: null,
        });
      } catch (error) {
        console.warn("Failed to build recommended solve", error);
        if (requestId !== this.solveRecommendationRequestId) {
          return;
        }
        this.setState({
          solveRecommendationLoading: false,
          solveRecommendation: null,
          solveRecommendationError: error && error.message ? error.message : "Recommended solve could not be built.",
        });
      }
    }, 0);
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
    const completed = solves.filter(({ DNF }) => !isDnfValue(DNF));
    const validTimes = solves
      .filter(({ DNF, time_solve }) => !isDnfValue(DNF) && Number.isFinite(parseFloat(time_solve)))
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

  resolveSolveDnf = (data, parsedMetrics = {}) => {
    if (data && data.DNF !== undefined) {
      return isDnfValue(data.DNF);
    }
    if (data && data.dnf !== undefined) {
      return isDnfValue(data.dnf);
    }
    if (data && data.success !== undefined) {
      return !isDnfValue(data.success);
    }
    return Boolean(parsedMetrics.isDnf);
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
      return this.formatSpecialCommText(comm.parse_text);
    }

    if (comm.phase === "parity" || comm.special_type === "parity") {
      const parityTarget = comm.parity_target || comm.target_b || comm.target_a;
      return parityTarget ? `${parityTarget}-Parity` : "Parity";
    }

    if (comm.special_type === "flip") {
      return `${[comm.target_a, comm.target_b].filter(Boolean).join("")}-Flip`.trim();
    }

    if (comm.special_type === "rotation" || comm.special_type === "twist") {
      return `${[comm.target_a, comm.target_b].filter(Boolean).join("")}-Twist`.trim();
    }

    return [comm.target_a, comm.target_b].filter(Boolean).join("");
  };

  formatSpecialCommText = (text) => {
    if (!text) {
      return text;
    }

    return String(text)
      .trim()
      .replace(/\s+(rotation|twist)$/i, "-Twist")
      .replace(/\s+flip$/i, "-Flip")
      .replace(/\s+parity$/i, "-Parity")
      .replace(/-(rotation|twist)$/i, "-Twist")
      .replace(/-flip$/i, "-Flip")
      .replace(/-parity$/i, "-Parity");
  };

  normalizeDisplayAlgText = (algText) => {
    const displayText = Array.isArray(algText)
      ? algText.find((entry) => typeof entry === "string")
      : algText;

    if (!displayText || typeof displayText === "object") {
      return "";
    }

    return String(displayText).trim();
  };

  translateMoves = (tokens, mapping) =>
    tokens.map((token) => {
      const match = token.match(/^([A-Za-z]+)(2|')?$/);
      if (!match) {
        return token;
      }

      const mapped = mapping[match[1]];
      return mapped ? `${mapped}${match[2] || ""}`.replace(/''/g, "") : token;
    });

  applyDisplayRotation = (tokens, rotation) => {
    const baseRotation = rotation && rotation[0];
    const maps = {
      x: { U: "F", F: "D", D: "B", B: "U", E: "S'", S: "E" },
      y: { R: "B", B: "L", L: "F", F: "R", M: "S", S: "M'" },
      z: { R: "U", U: "L", L: "D", D: "R", M: "E", E: "M'" },
    };

    if (!baseRotation || !maps[baseRotation]) {
      return tokens;
    }

    let next = tokens.slice();
    const amount = rotation.endsWith("2") ? 2 : rotation.endsWith("'") ? 3 : 1;
    for (let index = 0; index < amount; index += 1) {
      next = this.translateMoves(next, maps[baseRotation]);
    }
    return next;
  };

  canonicalizeDisplayWideMove = (token) => {
    const match = token && token.match(/^(\d+)?([URFDLBurfdlb])(w?)(2|')?$/);
    if (!match) {
      return token;
    }

    const [, layers, face, wideMarker, suffix = ""] = match;
    if (layers && layers !== "2") {
      return token;
    }

    if (wideMarker || face === face.toLowerCase()) {
      return `${face.toLowerCase()}${suffix}`;
    }

    return token;
  };

  convertWideMovesForDisplay = (tokens) => {
    return tokens.map((token) => this.canonicalizeDisplayWideMove(token));
  };

  slicePairToRotation = (first, second) => {
    const pair = [first, second].sort().join(" ");
    const directPairs = {
      "D U'": ["E'", "y'"],
      "D' U": ["E", "y"],
      "L' R": ["M", "x"],
      "L R'": ["M'", "x'"],
      "B' F": ["S'", "z"],
      "B F'": ["S", "z'"],
    };

    return directPairs[pair] || null;
  };

  convertSmartCubeSlicesForDisplay = (algText) => {
    const rawTokens = this.normalizeDisplayAlgText(algText).split(/\s+/).filter(Boolean);
    const tokens = this.convertWideMovesForDisplay(rawTokens);
    const sliced = [];
    let index = 0;

    while (index < tokens.length) {
      const slicePair =
        index + 1 < tokens.length ? this.slicePairToRotation(tokens[index], tokens[index + 1]) : null;
      if (slicePair) {
        sliced.push(...slicePair);
        index += 2;
      } else {
        sliced.push(tokens[index]);
        index += 1;
      }
    }

    const output = [];
    let remainder = sliced.slice();
    while (remainder.length) {
      const token = remainder.shift();
      if (["x", "x'", "x2", "y", "y'", "y2", "z", "z'", "z2"].includes(token)) {
        remainder = this.applyDisplayRotation(remainder, token);
      } else {
        output.push(token);
      }
    }

    return output.join(" ");
  };

  expandSliceMovesForDisplay = (algText) => {
    const rawTokens = this.normalizeDisplayAlgText(algText).split(/\s+/).filter(Boolean);
    if (!rawTokens.length) {
      return "";
    }

    const expandDoubles = [];
    rawTokens.forEach((token) => {
      const match = token.match(/^([MES])(2|')?$/i);
      if (!match) {
        expandDoubles.push(token);
        return;
      }

      const base = match[1].toUpperCase();
      const suffix = match[2] || "";
      if (suffix === "2") {
        expandDoubles.push(base, base);
      } else if (suffix === "'") {
        expandDoubles.push(`${base}'`);
      } else {
        expandDoubles.push(base);
      }
    });

    const sliceExpansion = {
      M: { turns: ["L'", "R"], unwindRotation: "x'" },
      "M'": { turns: ["L", "R'"], unwindRotation: "x" },
      E: { turns: ["D'", "U"], unwindRotation: "y'" },
      "E'": { turns: ["D", "U'"], unwindRotation: "y" },
      S: { turns: ["B", "F'"], unwindRotation: "z" },
      "S'": { turns: ["B'", "F"], unwindRotation: "z'" },
    };

    const output = [];
    let remainder = this.convertWideMovesForDisplay(expandDoubles);

    while (remainder.length) {
      const token = remainder.shift();
      const expansion = sliceExpansion[token];
      if (!expansion) {
        output.push(token);
        continue;
      }

      output.push(...expansion.turns);
      remainder = this.applyDisplayRotation(remainder, expansion.unwindRotation);
    }

    return output.join(" ");
  };

  compactRepeatedTurns = (algText, { convertSlices = true } = {}) => {
    const displayText = convertSlices === "preserve"
      ? this.normalizeDisplayAlgText(algText)
      : convertSlices
        ? this.convertSmartCubeSlicesForDisplay(algText)
        : this.expandSliceMovesForDisplay(algText);
    if (!displayText) {
      return "";
    }

    const tokens = displayText.split(/\s+/).filter(Boolean);
    const compacted = [];
    const getTurnParts = (token) => {
      if (!token) {
        return null;
      }
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

    return this.simplifyTurnSequence(compacted.join(" ")) || "";
  };

  normalizeAlgComparisonText = (algText, pieceType) => {
    const compacted = this.compactRepeatedTurns(algText, {
      convertSlices: pieceType === "edge",
    });
    if (!compacted) {
      return "";
    }

    const tokens = compacted
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => {
        const normalizedToken = String(token).trim();
        return normalizedToken.endsWith("2'") ? normalizedToken.slice(0, -1) : normalizedToken;
      });

    const commutingOppositePairs = new Set(["U:D", "D:U", "L:R", "R:L", "F:B", "B:F"]);
    const baseForToken = (token) => String(token).replace(/(2|')$/, "");
    const axisOrder = { D: 0, U: 1, L: 0, R: 1, B: 0, F: 1 };

    for (let index = 0; index < tokens.length - 1; index += 1) {
      const firstBase = baseForToken(tokens[index]);
      const secondBase = baseForToken(tokens[index + 1]);
      if (!commutingOppositePairs.has(`${firstBase}:${secondBase}`)) {
        continue;
      }

      if ((axisOrder[firstBase] || 0) > (axisOrder[secondBase] || 0)) {
        const current = tokens[index];
        tokens[index] = tokens[index + 1];
        tokens[index + 1] = current;
      }
    }

    return tokens.join(" ");
  };

  simplifyTurnSequence = (algText) => {
    const displayText = this.normalizeDisplayAlgText(algText);
    if (!displayText) {
      return "";
    }

    const amountForSuffix = (suffix) => {
      if (suffix === "2") {
        return 2;
      }
      if (suffix === "'") {
        return 3;
      }
      return 1;
    };
    const suffixForAmount = (amount) => {
      if (amount === 1) {
        return "";
      }
      if (amount === 2) {
        return "2";
      }
      if (amount === 3) {
        return "'";
      }
      return null;
    };
    const parseTurn = (token) => {
      if (!token) {
        return null;
      }
      const match = token.match(/^(.+?)(2|')?$/);
      return match ? { base: match[1], amount: amountForSuffix(match[2] || "") } : null;
    };
    const output = [];

    displayText.split(/\s+/).filter(Boolean).forEach((token) => {
      const current = parseTurn(token);
      const previousToken = output[output.length - 1];
      const previous = parseTurn(previousToken);

      if (!current || !previous || current.base !== previous.base) {
        output.push(token);
        return;
      }

      const combinedAmount = (previous.amount + current.amount) % 4;
      output.pop();
      const suffix = suffixForAmount(combinedAmount);
      if (suffix !== null) {
        output.push(`${current.base}${suffix}`);
      }
    });

    return output.join(" ");
  };

  formatReconstructionAlg = (comm) => {
    const formattedAlg = this.compactRepeatedTurns(comm && comm.alg, {
      convertSlices:
        comm &&
        (comm.phase === "edge" || (comm.phase === "unknown" && comm.displayPhase === "edge")),
    });
    return [formattedAlg, comm && comm.implicit_rotation].filter(Boolean).join(" ");
  };

  formatAlgLibraryAlg = (algText, pieceType) =>
    this.compactRepeatedTurns(algText, {
      convertSlices: pieceType === "edge",
    });

  formatReconstructionLine = (comm) =>
    [
      this.formatReconstructionAlg(comm),
      comm && comm.label ? `(${comm.label})` : null,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  formatScrambleForDetails = (scramble) =>
    this.simplifyTurnSequence(this.normalizeDisplayAlgText(scramble)) || "--";

  formatCommTimingPair = (comm) => {
    const recog = comm && Number.isFinite(comm.recogDuration) ? Number(comm.recogDuration) : null;
    const exec = comm && Number.isFinite(comm.execDuration) ? Number(comm.execDuration) : null;
    const total =
      recog !== null && exec !== null
        ? recog + exec
        : recog !== null
          ? recog
          : exec;
    return total !== null ? this.formatInlineDuration(total) : "--";
  };

  formatCommTimingValue = (seconds) => {
    return Number.isFinite(seconds) ? seconds.toFixed(1) : "--";
  };

  assignReconstructionDisplayPhases = (rows = []) => {
    const nextKnownDisplayPhases = new Array(rows.length).fill(null);
    let nextKnown = null;

    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row.phase === "edge") {
        nextKnown = "edge";
      } else if (row.phase === "corner" || row.phase === "parity") {
        nextKnown = "corner";
      }
      nextKnownDisplayPhases[index] = nextKnown;
    }

    let currentDisplayPhase = nextKnownDisplayPhases[0] || "edge";
    return rows.map((row, index) => {
      if (row.phase === "edge") {
        currentDisplayPhase = "edge";
      } else if (row.phase === "corner" || row.phase === "parity") {
        currentDisplayPhase = "corner";
      } else if (row.phase === "unknown") {
        currentDisplayPhase = currentDisplayPhase || nextKnownDisplayPhases[index] || "edge";
      }

      return {
        ...row,
        displayPhase: currentDisplayPhase || nextKnownDisplayPhases[index] || "edge",
      };
    });
  };

  groupCommBreakdown = (commStats = []) => {
    return this.assignReconstructionDisplayPhases(commStats).reduce(
      (groups, comm) => {
        const token = this.formatCommToken(comm);
        if (comm.phase === "edge" || (comm.phase === "unknown" && comm.displayPhase === "edge")) {
          if (token) {
            groups.edges.push(token);
          }
        } else if (comm.phase === "corner" || (comm.phase === "unknown" && comm.displayPhase === "corner")) {
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

  formatCornerPhaseElapsedTime = (solve, edgeComms, cornerComms) => {
    if (!solve || !Array.isArray(cornerComms) || !cornerComms.length) {
      return null;
    }

    const offsets = this.getTimedMoveOffsets(solve);
    const lastCornerBoundary = this.getCommBoundary(
      cornerComms[cornerComms.length - 1],
      null
    );
    const lastEdge =
      Array.isArray(edgeComms) && edgeComms.length
        ? edgeComms[edgeComms.length - 1]
        : null;
    const lastEdgeBoundary = lastEdge ? this.getCommBoundary(lastEdge, null) : null;
    const endOffset =
      lastCornerBoundary.end !== null
        ? offsets[lastCornerBoundary.end - 1]
        : null;
    const startOffset =
      lastEdgeBoundary && lastEdgeBoundary.end !== null
        ? offsets[lastEdgeBoundary.end - 1]
        : 0;

    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
      return null;
    }

    return this.formatInlineDuration(Math.max(endOffset - startOffset, 0));
  };

  getTimedMoveOffsets = (solve) =>
    Array.isArray(solve && solve.move_timeline)
      ? solve.move_timeline
          .map((move) => {
            const offset = Number(move && move.time_offset);
            return Number.isFinite(offset) ? offset : null;
          })
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

  getCommTimingSeconds = (solve, comm, previousEndIndex = 0) => {
    const offsets = this.getTimedMoveOffsets(solve);
    const boundary = this.getCommBoundary(comm, previousEndIndex + 1);
    const providedRecog =
      comm && comm.recog_time !== null && comm.recog_time !== undefined && Number.isFinite(Number(comm.recog_time))
        ? Number(comm.recog_time)
        : null;
    const providedExec =
      comm && comm.exec_time !== null && comm.exec_time !== undefined && Number.isFinite(Number(comm.exec_time))
        ? Number(comm.exec_time)
        : comm && comm.alg_time !== null && comm.alg_time !== undefined && Number.isFinite(Number(comm.alg_time))
          ? Number(comm.alg_time)
          : null;

    if (!offsets.length || boundary.start === null || boundary.end === null) {
      return {
        recog: providedRecog,
        exec: providedExec,
      };
    }

    const startOffset = offsets[boundary.start - 1];
    const endOffset = offsets[boundary.end - 1];
    const previousEndOffset = previousEndIndex > 0 ? offsets[previousEndIndex - 1] : 0;

    return {
      recog:
        Number.isFinite(startOffset) && Number.isFinite(previousEndOffset)
          ? Math.max(startOffset - previousEndOffset, 0)
          : providedRecog,
      exec:
        Number.isFinite(startOffset) && Number.isFinite(endOffset)
          ? Math.max(endOffset - startOffset, 0)
          : providedExec,
    };
  };

  enrichCommStatsWithTiming = (commStats = [], moveTimeline = []) => {
    if (!Array.isArray(commStats) || !commStats.length) {
      return [];
    }

    const timingSolve = { move_timeline: Array.isArray(moveTimeline) ? moveTimeline : [] };
    let previousEndIndex = 0;

    return commStats.map((comm) => {
      const boundary = this.getCommBoundary(comm, previousEndIndex + 1);
      const timing = this.getCommTimingSeconds(timingSolve, comm, previousEndIndex);

      if (boundary.end !== null) {
        previousEndIndex = boundary.end;
      }

      return {
        ...comm,
        recog_time: Number.isFinite(timing.recog) ? timing.recog : comm.recog_time,
        exec_time: Number.isFinite(timing.exec) ? timing.exec : comm.exec_time,
      };
    });
  };

  formatCommSummaryToken = (comm) => {
    const token = this.formatCommToken(comm);
    if (!token) {
      return "";
    }

    return this.formatSpecialCommText(token);
  };

  formatSolveDetailsCommLabel = (comm) => {
    const label = this.formatCommSummaryToken(comm);
    if (!label) {
      return { primary: "--", secondary: "" };
    }

    if (/-Parity$/i.test(label)) {
      return {
        primary: label.replace(/-Parity$/i, ""),
        secondary: "Prty",
      };
    }

    if (/-Flip$/i.test(label)) {
      return {
        primary: label.replace(/-Flip$/i, ""),
        secondary: "Flip",
      };
    }

    if (/-Twist$/i.test(label)) {
      return {
        primary: label.replace(/-Twist$/i, ""),
        secondary: "Twst",
      };
    }

    return { primary: label, secondary: "" };
  };

  getSolveDetailsCommLookup = (comm) => {
    const label = this.formatCommSummaryToken(comm);
    if (!comm || !label) {
      return null;
    }

    if (comm.phase === "parity" || comm.special_type === "parity") {
      return {
        label,
        pieceType: "parity",
        caseCode: label.replace(/-Parity$/i, ""),
      };
    }

    if (comm.special_type === "flip") {
      return {
        label,
        pieceType: "flip",
        caseCode: label.replace(/-Flip$/i, ""),
      };
    }

    if (comm.special_type === "rotation" || comm.special_type === "twist") {
      return {
        label,
        pieceType: "twist",
        caseCode: label.replace(/-Twist$/i, ""),
      };
    }

    if (comm.phase === "edge" || comm.phase === "corner") {
      return {
        label,
        pieceType: comm.phase,
        caseCode: label,
      };
    }

    return null;
  };

  getSolveDetailsCommRowKey = (comm) =>
    [
      comm && comm.comm_index,
      comm && comm.phase,
      comm && comm.move_start_index,
      comm && comm.move_end_index,
      comm && comm.parse_text,
    ]
      .filter((value) => value !== null && value !== undefined && value !== "")
      .join(":");

  buildSolveDetailsCaseKey = (pieceType, caseCode) => `${pieceType}:${caseCode}`;

  loadSolveDetailsCommLibrary = async (solve) => {
    const commStats = Array.isArray(solve && solve.comm_stats) ? solve.comm_stats : [];
    const lookups = commStats
      .map((comm) => ({ comm, lookup: this.getSolveDetailsCommLookup(comm) }))
      .filter(({ lookup }) => lookup);

    if (!lookups.length) {
      this.setState({
        loadingSolveDetailsCommLibrary: false,
        solveDetailsLibraryByCase: {},
        solveDetailsCommStatusByKey: {},
        selectedSolveCommCard: null,
      });
      return;
    }

    const caseRefs = [];
    const seen = new Set();
    lookups.forEach(({ lookup }) => {
      const key = this.buildSolveDetailsCaseKey(lookup.pieceType, lookup.caseCode);
      if (!seen.has(key)) {
        seen.add(key);
        caseRefs.push({
          pieceType: lookup.pieceType,
          caseCode: lookup.caseCode,
        });
      }
    });

    this.setState({ loadingSolveDetailsCommLibrary: true });

    try {
      const entries = await getAlgLibraryEntriesForCases(caseRefs);
      const libraryByCase = {};
      entries.forEach((entry) => {
        libraryByCase[this.buildSolveDetailsCaseKey(entry.piece_type, entry.case_code)] = entry;
      });

      const statusByRow = {};
      lookups.forEach(({ comm, lookup }) => {
        const rowKey = this.getSolveDetailsCommRowKey(comm);
        const entry = libraryByCase[this.buildSolveDetailsCaseKey(lookup.pieceType, lookup.caseCode)] || null;
        const usedAlg = this.normalizeAlgComparisonText(comm.alg || "", lookup.pieceType) || "";
        const preferredAlg = entry
          ? this.normalizeAlgComparisonText(entry.alg || "", entry.piece_type) || ""
          : "";

        statusByRow[rowKey] = !entry
          ? "missing"
          : usedAlg && preferredAlg && usedAlg === preferredAlg
            ? "match"
            : "mismatch";
      });

      this.setState({
        loadingSolveDetailsCommLibrary: false,
        solveDetailsLibraryByCase: libraryByCase,
        solveDetailsCommStatusByKey: statusByRow,
      });
    } catch (error) {
      console.warn("Failed to load solve-details comm library entries", error);
      this.setState({
        loadingSolveDetailsCommLibrary: false,
        solveDetailsLibraryByCase: {},
        solveDetailsCommStatusByKey: {},
      });
    }
  };

  openSolveDetailsCommCard = (comm) => {
    if (!comm) {
      return;
    }

    this.solveCommEditorDraftBuffer = null;
    this.setState({
      selectedSolveCommCard: comm,
      solveCommEditorDraft: null,
      solveCommEditorSaving: false,
    });
  };

  closeSolveDetailsCommCard = () => {
    this.solveCommEditorDraftBuffer = null;
    this.setState({
      selectedSolveCommCard: null,
      solveCommEditorDraft: null,
      solveCommEditorSaving: false,
    });
  };

  refreshSelectedSolveDetails = () => {
    const solve = this.state.selectedSolveDetails;
    if (!solve) {
      return;
    }

    this.openSolveDetails(solve);
  };

  openSolveDetailsCommEditor = (entry) => {
    if (!entry) {
      return;
    }

    const draft = {
      description: entry.description || "",
      alg: entry.alg || "",
      memoWord: entry.memo_word || "",
      category: entry.category || "",
      notes: entry.notes || "",
    };
    this.solveCommEditorDraftBuffer = draft;

    this.setState({
      solveCommEditorSaving: false,
      solveCommEditorDraft: draft,
    });
  };

  updateSolveCommEditorDraftField = (field, value) => {
    this.solveCommEditorDraftBuffer = {
      ...(this.solveCommEditorDraftBuffer || this.state.solveCommEditorDraft || {}),
      [field]: value,
    };
  };

  saveSolveDetailsCommEditor = async () => {
    const { selectedSolveCommCard, solveCommEditorDraft } = this.state;
    const draft = this.solveCommEditorDraftBuffer || solveCommEditorDraft;
    const lookup = selectedSolveCommCard ? this.getSolveDetailsCommLookup(selectedSolveCommCard) : null;
    if (!lookup || !draft) {
      return;
    }

    const caseKey = this.buildSolveDetailsCaseKey(lookup.pieceType, lookup.caseCode);
    const entry = this.state.solveDetailsLibraryByCase[caseKey] || null;
    if (!entry) {
      return;
    }

    this.setState({ solveCommEditorSaving: true });

    try {
      const savedEntry = await updateAlgLibraryEntry(entry.id, draft);
      await this.refreshAlgLibrarySummary();
      const rowKey = this.getSolveDetailsCommRowKey(selectedSolveCommCard);
      const usedAlg = this.normalizeAlgComparisonText(selectedSolveCommCard.alg || "", lookup.pieceType) || "";
      const preferredAlg = this.normalizeAlgComparisonText(savedEntry.alg || "", savedEntry.piece_type) || "";
      const nextStatus = usedAlg && preferredAlg && usedAlg === preferredAlg ? "match" : "mismatch";

      this.solveCommEditorDraftBuffer = null;
      this.setState((currentState) => ({
        solveCommEditorSaving: false,
        solveCommEditorDraft: null,
        solveDetailsLibraryByCase: {
          ...currentState.solveDetailsLibraryByCase,
          [caseKey]: savedEntry,
        },
        solveDetailsCommStatusByKey: {
          ...currentState.solveDetailsCommStatusByKey,
          [rowKey]: nextStatus,
        },
        algLibraryEntries: currentState.algLibraryEntries.map((libraryEntry) =>
          libraryEntry.id === savedEntry.id ? savedEntry : libraryEntry
        ),
      }));
    } catch (error) {
      console.warn("Failed to save solve-details comm edit", error);
      this.setState({ solveCommEditorSaving: false });
    }
  };

  getSolveDetailsMemoWord = (comm) => {
    if (!comm || comm.phase === "unknown") {
      return "?";
    }

    const lookup = this.getSolveDetailsCommLookup(comm);
    if (!lookup) {
      return "?";
    }

    const entry = this.state.solveDetailsLibraryByCase[
      this.buildSolveDetailsCaseKey(lookup.pieceType, lookup.caseCode)
    ] || null;
    const memoWord = entry && typeof entry.memo_word === "string" ? entry.memo_word.trim() : "";

    return memoWord || "?";
  };

  getSolveDetailsMemoLines = (details) => {
    if (!details) {
      return null;
    }

    const buildLine = (rows) => {
      const sourceRows = Array.isArray(rows) ? rows : [];
      const words = sourceRows.map(this.getSolveDetailsMemoWord);
      return sourceRows.length ? words.join(", ") : "--";
    };

    return {
      corners: buildLine(details.cornerRows || []),
      edges: buildLine(details.edgeRows || []),
    };
  };

  closeSolveDetailsModal = () => {
    this.solveCommEditorDraftBuffer = null;
    this.setState({
      showLastSolveDetails: false,
      loadingSolveDetails: false,
      loadingSolveDetailsCommLibrary: false,
      selectedSolveDetails: null,
      selectedSolveCommCard: null,
      solveCommEditorDraft: null,
      solveCommEditorSaving: false,
      solveDetailsLibraryByCase: {},
      solveDetailsCommStatusByKey: {},
      solveDetailsDnfCategory: "",
      solveDetailsDnfStage: "",
    });
  };

  isSameSolveRecord = (left, right) => {
    if (!left || !right) {
      return false;
    }

    if (left.id && right.id) {
      return left.id === right.id;
    }

    return left.date && right.date && left.date === right.date;
  };

  updateCurrentSolveRecord = (updater, options = {}) => {
    const { closeModal = false } = options;
    const selectedSolve = this.state.selectedSolveDetails;
    if (!selectedSolve) {
      return;
    }

    let nextSelectedSolve = null;
    let updated = false;

    this.updateActiveSessionSolves((solveStats) =>
      solveStats.reduce((nextSolves, solve) => {
        if (!updated && this.isSameSolveRecord(solve, selectedSolve)) {
          updated = true;
          const nextSolve = updater({ ...solve });
          if (nextSolve) {
            nextSelectedSolve = nextSolve;
            nextSolves.push(nextSolve);
          }
          return nextSolves;
        }

        nextSolves.push(solve);
        return nextSolves;
      }, [])
    );

    if (!updated) {
      return;
    }

    if (closeModal) {
      this.closeSolveDetailsModal();
      return;
    }

    this.setState({ selectedSolveDetails: nextSelectedSolve });
  };

  deleteSelectedSolve = () => {
    if (!this.state.selectedSolveDetails) {
      return;
    }

    if (!window.confirm("Delete this solve?")) {
      return;
    }

    this.updateCurrentSolveRecord(() => null, { closeModal: true });
  };

  saveSelectedSolveDnfReason = () => {
    const category = this.state.solveDetailsDnfCategory || "";
    const stage = this.state.solveDetailsDnfStage || "";
    let reason = "";

    if (category === "Wrong Exec") {
      reason = stage ? `Wrong ${stage} Exec` : "Wrong Exec";
    } else if (category === "Forgot Memo") {
      reason = stage ? `Forgot ${stage} Memo` : "Forgot Memo";
    }

    this.updateCurrentSolveRecord((solve) => ({
      ...solve,
      DNF: Boolean(reason),
      dnf_reason: reason,
    }));
  };

  clearSelectedSolveDnfReason = () => {
    this.setState(
      {
        solveDetailsDnfCategory: "",
        solveDetailsDnfStage: "",
      },
      () => {
        this.updateCurrentSolveRecord((solve) => ({
          ...solve,
          DNF: false,
          dnf_reason: "",
        }));
      }
    );
  };

  handleSolveDetailsDnfCategoryChange = (value) => {
    this.setState(
      {
        solveDetailsDnfCategory: value,
      },
      () => {
        if (value) {
          this.saveSelectedSolveDnfReason();
        } else {
          this.clearSelectedSolveDnfReason();
        }
      }
    );
  };

  handleSolveDetailsDnfStageChange = (value) => {
    this.setState(
      {
        solveDetailsDnfStage: value,
      },
      () => {
        if (this.state.solveDetailsDnfCategory) {
          this.saveSelectedSolveDnfReason();
        }
      }
    );
  };

  getDrillPieceTypeOptions = () => [
    { value: "edge", label: "Edges" },
    { value: "corner", label: "Corners" },
    { value: "flip", label: "Flips" },
    { value: "twist", label: "Twists" },
    { value: "parity", label: "Parity" },
  ];

  getAlgReviewGroupLabel = (value) => {
    if (!value || value === "all") {
      return "All";
    }
    return value;
  };

  getAlgReviewEntryKey = (entry) => {
    if (!entry) {
      return "unknown";
    }
    return entry.id || `${entry.piece_type || "case"}:${entry.case_code || ""}`;
  };

  formatDrillSeconds = (seconds) => {
    const value = Number(seconds);
    return Number.isFinite(value) ? value.toFixed(1) : "--";
  };

  persistAlgReviewAttemptRecords = (records = []) => {
    const nextRecords = Array.isArray(records) ? records.slice(-1000) : [];
    this.safeSetJsonStorage("algReviewAttemptRecords", nextRecords, "alg review attempts");
    return nextRecords;
  };

  clearAlgReviewProgress = () => {
    this.safeRemoveLocalStorageItem("algReviewProgress");
    this.setState({ algReviewProgress: null });
  };

  saveAlgReviewProgress = (extra = {}) => {
    const progress = {
      savedAt: new Date().toISOString(),
      pieceType: this.state.algReviewPieceType,
      group: this.state.algReviewGroup,
      queue: this.state.drillQueue,
      currentIndex: this.state.drillCurrentIndex,
      currentEntry: this.state.drillCurrentEntry,
      nextEntry: this.state.drillNextEntry,
      completedCount: this.state.drillCompletedCount,
      skippedCount: this.state.drillSkippedCount,
      reviewEntries: this.state.drillReviewEntries,
      attemptRecords: this.state.algReviewAttemptRecords,
      ...extra,
    };
    this.safeSetJsonStorage("algReviewProgress", progress, "alg review progress");
    this.setState({ algReviewProgress: progress });
    return progress;
  };

  pauseDrillSession = () => {
    if (this.state.drillMode === "alg-review") {
      this.saveAlgReviewProgress({ pausedAt: new Date().toISOString() });
      this.resetAlgReviewAttemptCube();
    }
    const processedMoveCount = this.setDrillProcessedMoveCursor();
    this.setState({
      drillSessionActive: false,
      drillExecutingEntry: null,
      drillExecutionStartIndex: null,
      drillProcessedMoveCount: processedMoveCount,
      drillStatusMessage: "Paused",
      drillCurrentMoves: [],
      algReviewPeekVisible: false,
    });
  };

  resumeAlgReviewProgress = () => {
    const progress = this.state.algReviewProgress || this.parseJsonStorage("algReviewProgress", null);
    if (!progress || !Array.isArray(progress.queue)) {
      return;
    }

    const processedMoveCount = this.setDrillProcessedMoveCursor();
    this.setState({
      drillMode: "alg-review",
      algReviewPieceType: progress.pieceType || "edge",
      algReviewGroup: progress.group || "all",
      drillSessionActive: true,
      drillQueue: progress.queue,
      drillCurrentIndex: Number.isFinite(Number(progress.currentIndex)) ? Number(progress.currentIndex) : 0,
      drillCurrentEntry: progress.currentEntry || null,
      drillNextEntry: progress.nextEntry || null,
      drillExecutingEntry: null,
      drillExecutionStartIndex: null,
      drillProcessedMoveCount: processedMoveCount,
      drillStatusMessage: "Resumed",
      drillCompletedCount: Number(progress.completedCount) || 0,
      drillSkippedCount: Number(progress.skippedCount) || 0,
      drillReviewEntries: Array.isArray(progress.reviewEntries) ? progress.reviewEntries : [],
      algReviewAttemptRecords: Array.isArray(progress.attemptRecords) ? progress.attemptRecords : this.state.algReviewAttemptRecords,
      drillCurrentMoves: [],
      algReviewPeekVisible: false,
      drillPromptStartedAt: Date.now(),
      drillAttemptStartedAt: null,
      drillCurrentRetryCount: 0,
    });
  };

  setDrillMode = (drillMode) => {
    this.setState({ drillMode, algReviewPeekVisible: false, drillStatusMessage: "", drillCurrentMoves: [] }, () => {
      if (drillMode === "alg-review" && !this.state.algReviewGroups.length) {
        this.loadAlgReviewOptions().catch((error) => {
          console.warn("Failed to load alg review options", error);
        });
      }
    });
  };

  setAlgReviewPieceType = (pieceType) => {
    this.setState(
      {
        algReviewPieceType: pieceType,
        algReviewGroup: "all",
        algReviewGroups: [],
        algReviewEntries: [],
      },
      () => {
        this.loadAlgReviewOptions(pieceType).catch((error) => {
          console.warn("Failed to load alg review groups", error);
        });
      }
    );
  };

  loadAlgReviewOptions = async (pieceType = this.state.algReviewPieceType) => {
    await this.ensureBundledAlgLibraryLoaded({ refreshEntries: false, silent: true });
    const result = await getAlgLibraryEntries({ pieceType, search: "", limit: 5000 });
    const entries = Array.isArray(result && result.entries) ? result.entries : [];
    const groups = Array.from(
      new Set(entries.map((entry) => entry.category || "Unsorted").filter(Boolean))
    ).sort((left, right) => left.localeCompare(right));

    this.setState({ algReviewEntries: entries, algReviewGroups: groups });
    return { entries, groups };
  };

  getFilteredDrillEntries = async () => {
    await this.ensureBundledAlgLibraryLoaded({ refreshEntries: false, silent: true });

    if (this.state.drillMode === "alg-review") {
      let entries = Array.isArray(this.state.algReviewEntries) ? this.state.algReviewEntries : [];
      if (!entries.length || entries.some((entry) => entry.piece_type !== this.state.algReviewPieceType)) {
        const loaded = await this.loadAlgReviewOptions(this.state.algReviewPieceType);
        entries = loaded.entries;
      }

      return entries.filter((entry) => {
        const group = entry.category || "Unsorted";
        return this.state.algReviewGroup === "all" || group === this.state.algReviewGroup;
      });
    }

    const selectedTypes = Array.isArray(this.state.drillPieceTypes) ? this.state.drillPieceTypes : [];
    const result = await getAlgLibraryEntries({ limit: 2000 });
    const allEntries = Array.isArray(result && result.entries) ? result.entries : [];
    return allEntries.filter((entry) => selectedTypes.includes(entry.piece_type));
  };

  splitAlgReviewMoves = (algText = "") =>
    this.normalizeDisplayAlgText(algText)
      .replace(/[\u2018\u2019]/g, "'")
      .split(/\s+/)
      .map((move) => move.trim())
      .filter(Boolean);

  normalizeAlgReviewMoveToken = (move) => {
    const token = String(move || "").trim().replace(/[\u2018\u2019]/g, "'");
    if (!token) {
      return "";
    }

    const match = token.match(/^(.+?)(2'?|'?)?$/);
    if (!match) {
      return token;
    }

    let base = match[1];
    let suffix = match[2] || "";
    if (suffix === "2'") {
      suffix = "2";
    }

    const wideMatch = base.match(/^([urfdlb])w?$/);
    if (wideMatch) {
      base = `${wideMatch[1].toUpperCase()}w`;
    }

    return `${base}${suffix}`;
  };

  getAlgReviewOrientation = () =>
    (this.state.parse_settings && this.state.parse_settings.CUBE_OREINTATION) || "yellow-green";

  getCubeMoveCount = (cubeMoves = this.state.cube_moves) =>
    Array.isArray(cubeMoves) ? cubeMoves.length : 0;

  setDrillProcessedMoveCursor = (cubeMovesOrCount = this.state.cube_moves) => {
    const moveCount = Array.isArray(cubeMovesOrCount)
      ? cubeMovesOrCount.length
      : Number(cubeMovesOrCount);
    const normalizedCount = Number.isFinite(moveCount) && moveCount > 0 ? moveCount : 0;
    this.drillProcessedMoveCount = normalizedCount;
    return normalizedCount;
  };

  getDrillProcessedMoveCursor = (cubeMoves = []) => {
    const stateCount = Number(this.state.drillProcessedMoveCount) || 0;
    const cursorCount = Number.isFinite(this.drillProcessedMoveCount)
      ? this.drillProcessedMoveCount
      : stateCount;
    const moveCount = this.getCubeMoveCount(cubeMoves);
    return cursorCount > moveCount ? 0 : cursorCount;
  };

  getAlgReviewOrientedMoves = (moves = [], options = {}) => {
    const moveTokens = Array.isArray(moves)
      ? moves.map((move) => String(move || "").trim()).filter(Boolean)
      : this.splitAlgReviewMoves(moves);
    if (!moveTokens.length) {
      return [];
    }

    try {
      const normalized = normalizeForOrientation("", moveTokens.join(" "), this.getAlgReviewOrientation());
      const useSmartCubeSlicePairs = this.shouldUseAlgReviewSlicePairs(options);
      const key = useSmartCubeSlicePairs ? "solveTokens" : "commSolveTokens";
      return (normalized[key] || normalized.solveTokens || normalized.commSolveTokens || moveTokens)
        .map((move) => this.normalizeAlgReviewMoveToken(move))
        .filter(Boolean);
    } catch (error) {
      console.warn("Failed to orient Alg Review moves", error);
      return moveTokens.map((move) => this.normalizeAlgReviewMoveToken(move)).filter(Boolean);
    }
  };

  getAlgReviewTargetMoves = (moves = []) => {
    const moveTokens = Array.isArray(moves)
      ? moves.map((move) => String(move || "").trim()).filter(Boolean)
      : this.splitAlgReviewMoves(moves);
    return moveTokens.map((move) => this.normalizeAlgReviewMoveToken(move)).filter(Boolean);
  };

  getAlgReviewPieceType = (options = {}) => {
    const entry = options.entry || null;
    return String(options.pieceType || (entry && entry.piece_type) || "").toLowerCase();
  };

  shouldUseAlgReviewSlicePairs = (options = {}) => {
    if (Object.prototype.hasOwnProperty.call(options, "useSmartCubeSlicePairs")) {
      return Boolean(options.useSmartCubeSlicePairs);
    }
    if (this.getAlgReviewPieceType(options) === "corner") {
      return false;
    }
    return Boolean(options.display);
  };

  formatAlgReviewCurrentMoves = (moves = [], options = {}) => {
    const orientedMoves = this.getAlgReviewOrientedMoves(moves, { ...options, display: true });
    const compactedMoves = this.compactRepeatedTurns(orientedMoves.join(" "), { convertSlices: "preserve" });
    return this.splitAlgReviewMoves(compactedMoves);
  };

  applyAlgReviewMove = (cube, move) => {
    const normalizedMove = this.normalizeAlgReviewMoveToken(move);
    if (!cube || !normalizedMove) {
      return;
    }
    cube.applyMove(new Move(normalizedMove));
  };

  getAlgReviewStateSignature = (state) => {
    if (!state) {
      return "";
    }

    return ["EDGES", "CORNERS"]
      .map((orbit) => {
        const orbitState = state[orbit];
        if (!orbitState) {
          return `${orbit}:`;
        }
        return `${orbit}:${orbitState.permutation.join(",")}|${orbitState.orientation.join(",")}`;
      })
      .join(";");
  };

  resetAlgReviewAttemptCube = (options = {}) => {
    this.algReviewAttemptCube = new KPuzzle(ALG_REVIEW_CUBE_DEFINITION);
    if (options.clearMoves !== false) {
      this.algReviewAttemptMoves = [];
    }
    return this.algReviewAttemptCube;
  };

  getAlgReviewTargetAlgCandidates = (entry, options = {}) => {
    if (!entry) {
      return [];
    }

    const includeAlgFallback = options.includeAlgFallback !== false;
    const candidates = [];
    const addCandidate = (text) => {
      const normalized = this.normalizeDisplayAlgText(text || "");
      if (normalized && !candidates.includes(normalized)) {
        candidates.push(normalized);
      }
    };
    const description = this.normalizeDisplayAlgText(entry.description || "");
    if (description) {
      if (hasCommNotation(description)) {
        addCandidate(expandCommNotation(description, { simplify: true }));
      }
      addCandidate(description);
    }

    // Last-resort fallback for entries that do not have a comm/description saved yet.
    if (includeAlgFallback) {
      addCandidate(entry.alg || "");
    }
    return candidates;
  };

  getAlgReviewTargetAlgText = (entry, options = {}) => {
    const candidates = this.getAlgReviewTargetAlgCandidates(entry, options);
    return candidates[0] || "";
  };

  getAlgReviewTargetSignatures = (entry) => {
    const targetCandidates = this.getAlgReviewTargetAlgCandidates(entry);
    if (!entry || !targetCandidates.length) {
      return [];
    }

    const cacheKey = `${this.getAlgReviewEntryKey(entry)}:${targetCandidates.join("||")}`;
    if (this.algReviewTargetSignatureCache.has(cacheKey)) {
      return this.algReviewTargetSignatureCache.get(cacheKey);
    }

    let lastError = null;
    const targetSignatures = [];
    for (const targetAlg of targetCandidates) {
      try {
        const cube = new KPuzzle(ALG_REVIEW_CUBE_DEFINITION);
        this.getAlgReviewTargetMoves(targetAlg).forEach((move) => this.applyAlgReviewMove(cube, move));
        const signature = this.getAlgReviewStateSignature(cube.state);
        if (signature && !targetSignatures.includes(signature)) {
          targetSignatures.push(signature);
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!targetSignatures.length) {
      console.warn("Failed to build Alg Review target state", lastError, entry);
    }
    this.algReviewTargetSignatureCache.set(cacheKey, targetSignatures);
    return targetSignatures;
  };

  getAlgReviewTargetSignature = (entry) => {
    const signatures = this.getAlgReviewTargetSignatures(entry);
    return signatures[0] || null;
  };

  applyAlgReviewAttemptMoves = (moves = [], targetSignature = null, options = {}) => {
    this.resetAlgReviewAttemptCube({ clearMoves: false });

    try {
      let attemptSignature = this.getAlgReviewStateSignature(this.algReviewAttemptCube.state);
      const targetSignatures = Array.isArray(targetSignature)
        ? new Set(targetSignature)
        : targetSignature instanceof Set
          ? targetSignature
          : targetSignature
            ? new Set([targetSignature])
            : null;
      const orientedMoves = this.getAlgReviewOrientedMoves(moves, {
        ...options,
        useSmartCubeSlicePairs: true,
      });
      for (const move of orientedMoves) {
        this.applyAlgReviewMove(this.algReviewAttemptCube, move);
        attemptSignature = this.getAlgReviewStateSignature(this.algReviewAttemptCube.state);
        if (targetSignatures && targetSignatures.has(attemptSignature)) {
          return { signature: attemptSignature, matched: true };
        }
      }
      return targetSignatures
        ? { signature: attemptSignature, matched: false }
        : attemptSignature;
    } catch (error) {
      console.warn("Failed to apply Alg Review attempt moves", error);
      this.resetAlgReviewAttemptCube({ clearMoves: false });
      return targetSignature ? { signature: null, matched: false } : null;
    }
  };

  algReviewAttemptMatchesEntry = (entry, moves = []) => {
    const targetSignatures = this.getAlgReviewTargetSignatures(entry);
    if (!targetSignatures.length) {
      return false;
    }

    const attemptResult = this.applyAlgReviewAttemptMoves(moves, targetSignatures, { entry });
    return Boolean(attemptResult && attemptResult.matched);
  };

  buildDrillAttemptRecord = (entry, options = {}) => {
    const now = Date.now();
    const startedAt = Number(options.startedAt) || this.state.drillAttemptStartedAt || now;
    const promptStartedAt = Number(options.promptStartedAt) || this.state.drillPromptStartedAt || startedAt;
    const recogTime = Math.max((startedAt - promptStartedAt) / 1000, 0);
    const execTime = Math.max((now - startedAt) / 1000, 0);
    return {
      id: `alg-review-${now}-${Math.random().toString(36).slice(2, 7)}`,
      entryId: this.getAlgReviewEntryKey(entry),
      pieceType: entry && entry.piece_type ? entry.piece_type : "",
      caseCode: entry && entry.case_code ? entry.case_code : "",
      memoWord: entry && entry.memo_word ? entry.memo_word : "",
      category: entry && entry.category ? entry.category : "Unsorted",
      matched: options.matched !== false,
      skipped: Boolean(options.skipped),
      retries: Number(options.retries) || 0,
      recogTime: options.skipped ? null : recogTime,
      execTime: options.skipped ? null : execTime,
      completedAt: new Date(now).toISOString(),
    };
  };

  addAlgReviewAttemptRecord = (record) => {
    if (!record) {
      return this.state.algReviewAttemptRecords;
    }
    const records = this.persistAlgReviewAttemptRecords([
      ...(Array.isArray(this.state.algReviewAttemptRecords) ? this.state.algReviewAttemptRecords : []),
      record,
    ]);
    return records;
  };

  retryDrillEntry = () => {
    const retryEntry = this.state.drillExecutingEntry || this.state.drillCurrentEntry;
    if (!retryEntry) {
      return;
    }

    const isAlgReview = this.state.drillMode === "alg-review";
    const currentIndex = this.state.drillExecutingEntry && !isAlgReview
      ? Math.max((this.state.drillCurrentIndex || 0) - 1, 0)
      : this.state.drillCurrentIndex || 0;
    const queue = Array.isArray(this.state.drillQueue) ? this.state.drillQueue : [];
    const retryPrompt = isAlgReview
      ? this.buildAlgReviewPromptText(retryEntry)
      : this.buildDrillPromptText(retryEntry);

    if (isAlgReview) {
      this.resetAlgReviewAttemptCube();
    }
    const processedMoveCount = this.setDrillProcessedMoveCursor();
    this.setState((currentState) => ({
      drillCurrentIndex: currentIndex,
      drillCurrentEntry: retryEntry,
      drillNextEntry: queue[currentIndex + 1] || null,
      drillExecutingEntry: null,
      drillExecutionStartIndex: null,
      drillProcessedMoveCount: processedMoveCount,
      drillCurrentRetryCount: (currentState.drillCurrentRetryCount || 0) + 1,
      drillStatusMessage: `Retry ${retryPrompt}`,
      algReviewPeekVisible: false,
      drillCurrentMoves: [],
      drillPromptStartedAt: Date.now(),
      drillAttemptStartedAt: null,
    }));
  };

  toggleAlgReviewPeek = () => {
    this.setState((currentState) => ({ algReviewPeekVisible: !currentState.algReviewPeekVisible }));
  };

  openAlgReviewEditor = (entry) => {
    if (!entry) {
      return;
    }

    this.setState({
      algReviewEditorEntry: entry,
      algReviewEditorDraft: {
        description: entry.description || "",
        alg: entry.alg || "",
        memoWord: entry.memo_word || "",
        category: entry.category || "",
        notes: entry.notes || "",
      },
    });
  };

  closeAlgReviewEditor = () => {
    this.setState({ algReviewEditorEntry: null, algReviewEditorDraft: null, algReviewEditorSaving: false });
  };

  updateAlgReviewEditorDraftField = (field, value) => {
    this.setState((currentState) => ({
      algReviewEditorDraft: {
        ...(currentState.algReviewEditorDraft || {}),
        [field]: value,
      },
    }));
  };

  replaceAlgReviewEntry = (savedEntry) => {
    if (!savedEntry) {
      return;
    }

    const patchEntry = (entry) =>
      entry && this.getAlgReviewEntryKey(entry) === this.getAlgReviewEntryKey(savedEntry)
        ? { ...entry, ...savedEntry }
        : entry;

    this.setState((currentState) => ({
      algReviewEntries: currentState.algReviewEntries.map(patchEntry),
      drillQueue: currentState.drillQueue.map(patchEntry),
      drillCurrentEntry: patchEntry(currentState.drillCurrentEntry),
      drillNextEntry: patchEntry(currentState.drillNextEntry),
      drillExecutingEntry: patchEntry(currentState.drillExecutingEntry),
    }));
  };

  saveAlgReviewEditor = async () => {
    const { algReviewEditorEntry, algReviewEditorDraft } = this.state;
    if (!algReviewEditorEntry || !algReviewEditorDraft) {
      return;
    }

    this.setState({ algReviewEditorSaving: true });
    try {
      const savedEntry = await updateAlgLibraryEntry(algReviewEditorEntry.id, algReviewEditorDraft);
      await this.refreshAlgLibrarySummary();
      this.replaceAlgReviewEntry(savedEntry);
      this.setState({
        algReviewEditorEntry: null,
        algReviewEditorDraft: null,
        algReviewEditorSaving: false,
      });
    } catch (error) {
      console.warn("Failed to save alg review edit", error);
      this.setState({ algReviewEditorSaving: false });
    }
  };
  toggleDrillPieceType = (pieceType) => {
    this.setState((currentState) => {
      const currentTypes = Array.isArray(currentState.drillPieceTypes) ? currentState.drillPieceTypes : [];
      const exists = currentTypes.includes(pieceType);
      const nextTypes = exists
        ? currentTypes.filter((type) => type !== pieceType)
        : [...currentTypes, pieceType];

      return {
        drillPieceTypes: nextTypes.length ? nextTypes : [pieceType],
      };
    });
  };

  buildDrillPromptText = (entry) => {
    if (!entry) {
      return "--";
    }

    return entry.memo_word || entry.case_code || "--";
  };

  buildAlgReviewPromptText = (entry) => {
    if (!entry) {
      return "--";
    }

    return entry.memo_word || "--";
  };

  getActiveDrillPromptEntry = () => {
    if (this.state.drillMode === "alg-review") {
      return this.state.drillExecutingEntry || this.state.drillCurrentEntry;
    }

    if (this.state.drillDisplayMode === "current") {
      return this.state.drillExecutingEntry || this.state.drillCurrentEntry;
    }

    return this.state.drillCurrentEntry || this.state.drillExecutingEntry;
  };

  getActiveDrillPromptLabel = () => {
    if (this.state.drillDisplayMode === "current") {
      return this.state.drillExecutingEntry ? "Current comm" : "Memo";
    }

    return this.state.drillExecutingEntry ? "Next comm" : "Memo";
  };

  buildDrillQueue = (entries = []) => {
    const queue = entries
      .filter((entry) => entry && (entry.memo_word || entry.case_code) && entry.alg)
      .map((entry) => ({ ...entry }));

    for (let index = queue.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = queue[index];
      queue[index] = queue[swapIndex];
      queue[swapIndex] = current;
    }

    return queue;
  };

  addDrillReviewEntry = (entries = [], entry) => {
    if (!entry) {
      return entries;
    }

    const existingIndex = entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) {
      return entries.map((item, index) =>
        index === existingIndex ? { ...item, misses: (item.misses || 1) + 1 } : item
      );
    }

    return [...entries, { ...entry, misses: 1 }];
  };

  getDrillEntryLookup = (entry) => {
    if (!entry) {
      return null;
    }

    return {
      pieceType: entry.piece_type || "",
      caseCode: String(entry.case_code || "").toUpperCase(),
    };
  };

  drillCommMatchesEntry = (comm, entry) => {
    const commLookup = this.getSolveDetailsCommLookup(comm);
    const entryLookup = this.getDrillEntryLookup(entry);
    if (!commLookup || !entryLookup) {
      return false;
    }

    return (
      commLookup.pieceType === entryLookup.pieceType &&
      String(commLookup.caseCode || "").toUpperCase() === entryLookup.caseCode
    );
  };

  analyzeDrillMoves = (cubeMoves = []) => {
    if (!Array.isArray(cubeMoves) || !cubeMoves.length) {
      return [];
    }

    try {
      const analysis = buildLocalCommAnalysis({
        ...this.state.parse_settings,
        SCRAMBLE: "",
        SOLVE: cubeMoves.join(" "),
        PARSE_TO_LETTER_PAIR: true,
      });
      return Array.isArray(analysis && analysis.commStats) ? analysis.commStats : [];
    } catch (error) {
      console.warn("Failed to parse live drill moves", error);
      return [];
    }
  };

  getCompletedDrillComm = (cubeMoves, startIndex) => {
    if (!Number.isFinite(startIndex)) {
      return null;
    }

    const comms = this.analyzeDrillMoves(cubeMoves);
    return (
      comms.find(
        (comm) =>
          comm &&
          comm.phase !== "unknown" &&
          Number(comm.move_start_index) <= startIndex &&
          Number(comm.move_end_index) >= startIndex
      ) || null
    );
  };

  handleDrillMoveStream = (cubeMoves = []) => {
    if (!this.state.drillSessionActive || !Array.isArray(cubeMoves)) {
      return;
    }

    const previousMoveCount = this.getDrillProcessedMoveCursor(cubeMoves);
    if (cubeMoves.length <= previousMoveCount) {
      return;
    }
    const processedMoveCount = this.setDrillProcessedMoveCursor(cubeMoves.length);

    const isAlgReview = this.state.drillMode === "alg-review";
    const queue = Array.isArray(this.state.drillQueue) ? this.state.drillQueue : [];
    const newMoves = cubeMoves.slice(previousMoveCount);

    if (isAlgReview) {
      let executingEntry = this.state.drillExecutingEntry || this.state.drillCurrentEntry;
      if (!executingEntry) {
        this.setState({ drillProcessedMoveCount: processedMoveCount });
        return;
      }

      let attemptStartedAt = this.state.drillAttemptStartedAt;
      if (!this.state.drillExecutingEntry) {
        attemptStartedAt = Date.now();
        this.resetAlgReviewAttemptCube();
      }

      const rawAttemptMoves = [...(Array.isArray(this.algReviewAttemptMoves) ? this.algReviewAttemptMoves : []), ...newMoves];
      this.algReviewAttemptMoves = rawAttemptMoves;
      const currentMoves = this.formatAlgReviewCurrentMoves(rawAttemptMoves, { entry: executingEntry });
      const matched = this.algReviewAttemptMatchesEntry(executingEntry, rawAttemptMoves);
      const promptStartedAt = this.state.drillPromptStartedAt || attemptStartedAt || Date.now();
      const nextState = {
        drillProcessedMoveCount: processedMoveCount,
        drillExecutingEntry: executingEntry,
        drillExecutionStartIndex: Number.isFinite(this.state.drillExecutionStartIndex)
          ? this.state.drillExecutionStartIndex
          : previousMoveCount + 1,
        drillAttemptStartedAt: attemptStartedAt,
        drillCurrentMoves: currentMoves,
        algReviewPeekVisible: false,
        drillStatusMessage: `Executing ${this.buildAlgReviewPromptText(executingEntry)}`,
      };

      if (matched) {
        const nextIndex = (this.state.drillCurrentIndex || 0) + 1;
        const nextEntry = queue[nextIndex] || null;
        const followingEntry = queue[nextIndex + 1] || null;
        const record = this.buildDrillAttemptRecord(executingEntry, {
          matched: true,
          retries: this.state.drillCurrentRetryCount || 0,
          promptStartedAt,
          startedAt: attemptStartedAt || Date.now(),
        });
        const nextAttemptRecords = this.persistAlgReviewAttemptRecords([
          ...(Array.isArray(this.state.algReviewAttemptRecords) ? this.state.algReviewAttemptRecords : []),
          record,
        ]);

        Object.assign(nextState, {
          drillCurrentIndex: nextIndex,
          drillCurrentEntry: nextEntry,
          drillNextEntry: followingEntry,
          drillExecutingEntry: null,
          drillExecutionStartIndex: null,
          drillAttemptStartedAt: null,
          drillCurrentRetryCount: 0,
          drillCurrentMoves: [],
          drillCompletedCount: this.state.drillCompletedCount + 1,
          algReviewAttemptRecords: nextAttemptRecords,
          drillStatusMessage: nextEntry ? `Finished ${this.buildAlgReviewPromptText(executingEntry)}` : "Done",
          drillSessionActive: Boolean(nextEntry),
          drillPromptStartedAt: Date.now(),
        });
        this.resetAlgReviewAttemptCube();

        if (!nextEntry) {
          this.safeRemoveLocalStorageItem("algReviewProgress");
          nextState.algReviewProgress = null;
        }
      }

      this.setState(nextState);
      return;
    }

    let executingEntry = this.state.drillExecutingEntry;
    let executionStartIndex = this.state.drillExecutionStartIndex;
    let currentIndex = this.state.drillCurrentIndex;
    let currentEntry = this.state.drillCurrentEntry;
    let nextEntry = this.state.drillNextEntry;
    const nextState = {
      drillProcessedMoveCount: processedMoveCount,
    };

    if (!executingEntry && currentEntry) {
      executingEntry = currentEntry;
      executionStartIndex = previousMoveCount + 1;
      currentIndex += 1;
      currentEntry = queue[currentIndex] || null;
      nextEntry = queue[currentIndex + 1] || null;

      Object.assign(nextState, {
        drillExecutingEntry: executingEntry,
        drillExecutionStartIndex: executionStartIndex,
        drillCurrentIndex: currentIndex,
        drillCurrentEntry: currentEntry,
        drillNextEntry: nextEntry,
        drillAttemptStartedAt: Date.now(),
        drillPromptStartedAt: Date.now(),
        drillStatusMessage: `Executing ${this.buildDrillPromptText(executingEntry)}`,
      });
    }

    const completedComm = executingEntry
      ? this.getCompletedDrillComm(cubeMoves, executionStartIndex)
      : null;

    if (completedComm && executingEntry) {
      const matched = this.drillCommMatchesEntry(completedComm, executingEntry);
      Object.assign(nextState, {
        drillExecutingEntry: null,
        drillExecutionStartIndex: null,
        drillAttemptStartedAt: null,
        drillCurrentRetryCount: 0,
        drillCompletedCount: this.state.drillCompletedCount + 1,
        drillReviewEntries: matched
          ? this.state.drillReviewEntries
          : this.addDrillReviewEntry(this.state.drillReviewEntries, executingEntry),
        drillStatusMessage: matched
          ? `Finished ${this.buildDrillPromptText(executingEntry)}`
          : `Review ${this.buildDrillPromptText(executingEntry)}`,
        drillSessionActive: Boolean(currentEntry || nextEntry),
      });
    }

    this.setState(nextState);
  };
  startDrillSession = async () => {
    if (this.state.drillMode === "alg-review") {
      this.resetAlgReviewAttemptCube();
    }
    this.setState({ drillLoading: true, algReviewPeekVisible: false, drillCurrentMoves: [] });

    try {
      const filteredEntries = await this.getFilteredDrillEntries();
      const queue = this.buildDrillQueue(filteredEntries);
      const now = Date.now();

      if (this.state.drillMode === "alg-review") {
        this.safeRemoveLocalStorageItem("algReviewProgress");
      }

      const processedMoveCount = this.setDrillProcessedMoveCursor();
      this.setState({
        drillLoading: false,
        drillSessionActive: Boolean(queue.length),
        drillQueue: queue,
        drillCurrentIndex: 0,
        drillCurrentEntry: queue[0] || null,
        drillNextEntry: queue[1] || null,
        drillExecutingEntry: null,
        drillExecutionStartIndex: null,
        drillProcessedMoveCount: processedMoveCount,
        drillStatusMessage: queue.length ? "Ready" : "No algs found for this set",
        drillCompletedCount: 0,
        drillSkippedCount: 0,
        drillReviewEntries: [],
        drillPromptStartedAt: now,
        drillAttemptStartedAt: null,
        drillCurrentRetryCount: 0,
        algReviewAttemptRecords: this.state.drillMode === "alg-review" ? [] : this.state.algReviewAttemptRecords,
        algReviewProgress: this.state.drillMode === "alg-review" ? null : this.state.algReviewProgress,
      });
    } catch (error) {
      console.warn("Failed to start drill session", error);
      const processedMoveCount = this.setDrillProcessedMoveCursor();
      this.setState({
        drillLoading: false,
        drillSessionActive: false,
        drillQueue: [],
        drillCurrentIndex: 0,
        drillCurrentEntry: null,
        drillNextEntry: null,
        drillExecutingEntry: null,
        drillExecutionStartIndex: null,
        drillProcessedMoveCount: processedMoveCount,
        drillStatusMessage: "Could not load drill algs",
        drillCompletedCount: 0,
        drillSkippedCount: 0,
        drillReviewEntries: [],
        drillPromptStartedAt: null,
        drillAttemptStartedAt: null,
        drillCurrentRetryCount: 0,
      });
    }
  };
  advanceDrillSession = (options = {}) => {
    const { skipped = false, missed = false } = options;
    const currentEntry = this.state.drillExecutingEntry || this.state.drillCurrentEntry;
    const queue = Array.isArray(this.state.drillQueue) ? this.state.drillQueue : [];
    const isAlgReview = this.state.drillMode === "alg-review";
    const nextIndex = this.state.drillExecutingEntry && !isAlgReview
      ? this.state.drillCurrentIndex
      : this.state.drillCurrentIndex + 1;
    const nextEntry = queue[nextIndex] || null;
    const followingEntry = queue[nextIndex + 1] || null;
    const processedMoveCount = this.setDrillProcessedMoveCursor();

    this.setState((currentState) => {
      const nextReviewEntries = (missed || skipped) && currentEntry
        ? this.addDrillReviewEntry(currentState.drillReviewEntries, currentEntry)
        : currentState.drillReviewEntries;
      let nextAttemptRecords = currentState.algReviewAttemptRecords;

      if (isAlgReview && currentEntry) {
        const record = this.buildDrillAttemptRecord(currentEntry, {
          skipped,
          matched: !missed && !skipped,
          retries: currentState.drillCurrentRetryCount || 0,
          promptStartedAt: currentState.drillPromptStartedAt,
          startedAt: currentState.drillAttemptStartedAt || Date.now(),
        });
        nextAttemptRecords = this.persistAlgReviewAttemptRecords([
          ...(Array.isArray(currentState.algReviewAttemptRecords) ? currentState.algReviewAttemptRecords : []),
          record,
        ]);
      }

      if (isAlgReview && !nextEntry) {
        this.safeRemoveLocalStorageItem("algReviewProgress");
      }
      if (isAlgReview) {
        this.resetAlgReviewAttemptCube();
      }

      return {
        drillCurrentIndex: nextIndex,
        drillCurrentEntry: nextEntry,
        drillNextEntry: followingEntry,
        drillExecutingEntry: null,
        drillExecutionStartIndex: null,
        drillProcessedMoveCount: processedMoveCount,
        drillCompletedCount: currentState.drillCompletedCount + (skipped ? 0 : 1),
        drillSkippedCount: currentState.drillSkippedCount + (skipped ? 1 : 0),
        drillReviewEntries: nextReviewEntries,
        drillCurrentMoves: [],
        algReviewAttemptRecords: nextAttemptRecords,
        algReviewProgress: isAlgReview && !nextEntry ? null : currentState.algReviewProgress,
        drillSessionActive: Boolean(nextEntry),
        drillStatusMessage: skipped ? "Skipped" : missed ? "Marked for review" : currentState.drillStatusMessage,
        drillPromptStartedAt: Date.now(),
        drillAttemptStartedAt: null,
        drillCurrentRetryCount: 0,
        algReviewPeekVisible: false,
      };
    });
  };
  endDrillSession = () => {
    if (this.state.drillMode === "alg-review") {
      this.safeRemoveLocalStorageItem("algReviewProgress");
      this.resetAlgReviewAttemptCube();
    }

    const processedMoveCount = this.setDrillProcessedMoveCursor();
    this.setState({
      drillSessionActive: false,
      drillQueue: [],
      drillCurrentIndex: 0,
      drillCurrentEntry: null,
      drillNextEntry: null,
      drillExecutingEntry: null,
      drillExecutionStartIndex: null,
      drillProcessedMoveCount: processedMoveCount,
      drillStatusMessage: "",
      drillCurrentMoves: [],
      drillPromptStartedAt: null,
      drillAttemptStartedAt: null,
      drillCurrentRetryCount: 0,
      algReviewPeekVisible: false,
      algReviewProgress: null,
    });
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

  getSolveRankInSession = (solve, solves) => {
    if (!solve || !Array.isArray(solves) || isDnfValue(solve.DNF)) {
      return null;
    }

    const completedSolves = solves
      .filter((entry) => !isDnfValue(entry.DNF) && Number.isFinite(parseFloat(entry.time_solve)))
      .slice()
      .sort((a, b) => parseFloat(a.time_solve) - parseFloat(b.time_solve));

    const index = completedSolves.findIndex((entry) => this.isSameSolveRecord(entry, solve));
    return index >= 0 ? index + 1 : null;
  };

  getSolveHistoryTag = (solve, solves) => {
    if (!solve) {
      return { prefix: "--", reason: "", isDnf: false };
    }

    if (isDnfValue(solve.DNF)) {
      return {
        prefix: "DNF.",
        reason: solve.dnf_reason || "",
        isDnf: true,
      };
    }

    const rank = this.getSolveRankInSession(solve, solves);
    return {
      prefix: "Success.",
      reason: rank ? `#${rank}` : "",
      isDnf: false,
    };
  };

  countAlgMoves = (algText) => {
    const normalizedAlg = this.normalizeDisplayAlgText(algText);
    if (!normalizedAlg) {
      return null;
    }

    try {
      return countMoves(new Alg(normalizedAlg));
    } catch (_error) {
      return null;
    }
  };

  getSolveMoveCountForTps = (solve) => {
    if (!solve) {
      return null;
    }

    if (Array.isArray(solve.comm_stats) && solve.comm_stats.length) {
      const parsedMoveCount = solve.comm_stats.reduce((total, comm) => {
        const moveCount = this.countAlgMoves(comm && comm.alg);
        return Number.isFinite(moveCount) ? total + moveCount : total;
      }, 0);

      if (parsedMoveCount > 0) {
        return parsedMoveCount;
      }
    }

    if (Array.isArray(solve.solve)) {
      const parsedMoveCount = this.countAlgMoves(solve.solve.join(" "));
      if (Number.isFinite(parsedMoveCount) && parsedMoveCount > 0) {
        return parsedMoveCount;
      }
    }

    if (typeof solve.solve === "string") {
      const parsedMoveCount = this.countAlgMoves(solve.solve);
      if (Number.isFinite(parsedMoveCount) && parsedMoveCount > 0) {
        return parsedMoveCount;
      }
    }

    const storedMoveCount = parseFloat(solve.move_count);
    return Number.isFinite(storedMoveCount) && storedMoveCount > 0 ? storedMoveCount : null;
  };

  getSolveTpsValue = (solve) => {
    if (!solve) {
      return null;
    }

    const execSeconds = parseFloat(solve.exe_time);
    if (!Number.isFinite(execSeconds) || execSeconds <= 0) {
      return null;
    }

    const moveCount = this.getSolveMoveCountForTps(solve);

    if (!Number.isFinite(moveCount) || moveCount <= 0) {
      return null;
    }

    return (moveCount / execSeconds).toFixed(2);
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

      const tokens = comms.map(this.formatCommSummaryToken).filter(Boolean).join(", ");
      return `${tokens}${Number.isFinite(span) ? ` (${this.formatInlineDuration(span)})` : ""}`;
    };
    const formatTimeValue = (value) => {
      const numericValue = parseFloat(value);
      return Number.isFinite(numericValue) ? this.convert_sec_to_format(numericValue) : "--";
    };
    const formatMoveCount = (value) => {
      if (!Number.isFinite(value)) {
        return "--";
      }
      return Number.isInteger(value) ? String(value) : Number(value.toFixed(1)).toString();
    };

    let previousEndIndex = 0;
    const timedRows = commStats.map((comm) => {
      const boundary = this.getCommBoundary(comm, previousEndIndex + 1);
      const timing = this.getCommTimingSeconds(solve, comm, previousEndIndex);
      if (boundary.end !== null) {
        previousEndIndex = boundary.end;
      }

      return {
        ...comm,
        label: this.formatCommSummaryToken(comm),
        recogDuration: timing.recog,
        execDuration: timing.exec,
      };
    });
    const reconstructionRows = this.assignReconstructionDisplayPhases(timedRows);
    const solveMoveCount = this.getSolveMoveCountForTps(solve);
    const execSeconds = parseFloat(solve.exe_time);
    const solveTps =
      Number.isFinite(solveMoveCount) &&
      solveMoveCount > 0 &&
      Number.isFinite(execSeconds) &&
      execSeconds > 0
        ? (solveMoveCount / execSeconds).toFixed(2)
        : null;
    const pauseRows = reconstructionRows.slice(1).filter((comm) => Number.isFinite(comm.recogDuration));
    const pauseSeconds = pauseRows.reduce((total, comm) => total + Number(comm.recogDuration), 0);

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
      title: this.formatSolveResultLabel(solve),
      solveNumber,
      date: this.formatDateLine(solve.date),
      memoExecLabel: `${formatTimeValue(solve.memo_time)} | ${formatTimeValue(solve.exe_time)}`,
      metrics: [
        { label: "Algs", value: String(commStats.length) },
        { label: "Moves", value: formatMoveCount(solveMoveCount) },
        { label: "TPS", value: solveTps || "--" },
        { label: "Pauses", value: pauseRows.length ? this.formatCommTimingValue(pauseSeconds) : "--" },
      ],
      edgeSummary: formatSummary(edgeComms, edgeSpan),
      cornerSummary: formatSummary(cornerSummaryComms, cornerSpan),
      edgeRows: reconstructionRows.filter((comm) => comm.displayPhase === "edge"),
      cornerRows: reconstructionRows.filter((comm) => comm.displayPhase === "corner"),
      reconstructionRows,
      transitionSeconds,
      scramble: this.formatScrambleForDetails(solve.scramble || ""),
      link: this.withRecordedScrambleInCubedb(
        solve.link || null,
        solve.scramble || "",
        solve.solve || null,
        solve.cube_orientation || this.state.parse_settings.CUBE_OREINTATION
      ),
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
    const cornerTime = this.formatCornerPhaseElapsedTime(solve, edgeComms, cornerComms);
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

  getRecentCommHistory = (solves = [], limit = 8) => {
    const recentSolves = Array.isArray(solves) ? solves.slice().reverse() : [];
    const commsByToken = new Map();

    recentSolves.forEach((solve) => {
      if (!solve || !Array.isArray(solve.comm_stats) || !solve.comm_stats.length) {
        return;
      }

      let previousEndIndex = 0;
      solve.comm_stats.forEach((comm) => {
        const token = this.formatCommSummaryToken(comm);
        const boundary = this.getCommBoundary(comm, previousEndIndex + 1);
        const timing = this.getCommTimingSeconds(solve, comm, previousEndIndex);

        if (boundary.end !== null) {
          previousEndIndex = boundary.end;
        }

        if (!token || comm.phase === "unknown") {
          return;
        }

        const existing = commsByToken.get(token) || {
          token,
          phase: comm.phase,
          count: 0,
          recogTotal: 0,
          recogCount: 0,
          execTotal: 0,
          execCount: 0,
          lastSeen: null,
        };

        existing.count += 1;

        if (Number.isFinite(timing.recog)) {
          existing.recogTotal += Number(timing.recog);
          existing.recogCount += 1;
        }

        if (Number.isFinite(timing.exec)) {
          existing.execTotal += Number(timing.exec);
          existing.execCount += 1;
        }

        if (!existing.lastSeen || ((solve.date || 0) > existing.lastSeen)) {
          existing.lastSeen = solve.date || existing.lastSeen;
        }

        commsByToken.set(token, existing);
      });
    });

    return [...commsByToken.values()]
      .map((entry) => ({
        token: entry.token,
        phase: entry.phase,
        count: entry.count,
        avgRecog:
          entry.recogCount > 0 ? entry.recogTotal / entry.recogCount : null,
        avgExec:
          entry.execCount > 0 ? entry.execTotal / entry.execCount : null,
        lastSeen: entry.lastSeen,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }

        const aExec = Number.isFinite(a.avgExec) ? a.avgExec : Number.POSITIVE_INFINITY;
        const bExec = Number.isFinite(b.avgExec) ? b.avgExec : Number.POSITIVE_INFINITY;
        if (aExec !== bExec) {
          return bExec - aExec;
        }

        return String(a.token).localeCompare(String(b.token));
      })
      .slice(0, limit);
  };

  getAlgLibraryCaseStatsMap = (solves = []) => {
    const recentSolves = Array.isArray(solves) ? solves.slice().reverse() : [];
    const statsByCase = new Map();

    recentSolves.forEach((solve) => {
      if (!solve || !Array.isArray(solve.comm_stats) || !solve.comm_stats.length) {
        return;
      }

      let previousEndIndex = 0;
      solve.comm_stats.forEach((comm) => {
        if (!comm || !comm.phase || !comm.parse_text || comm.phase === "unknown") {
          return;
        }

        const timing = this.getCommTimingSeconds(solve, comm, previousEndIndex);
        const boundary = this.getCommBoundary(comm, previousEndIndex + 1);
        if (boundary.end !== null) {
          previousEndIndex = boundary.end;
        }

        const key = `${comm.phase}:${comm.parse_text}`;
        const existing = statsByCase.get(key) || {
          count: 0,
          execTotal: 0,
          execCount: 0,
          recogTotal: 0,
          recogCount: 0,
        };

        existing.count += 1;
        if (Number.isFinite(timing.exec)) {
          existing.execTotal += Number(timing.exec);
          existing.execCount += 1;
        }
        if (Number.isFinite(timing.recog)) {
          existing.recogTotal += Number(timing.recog);
          existing.recogCount += 1;
        }

        statsByCase.set(key, existing);
      });
    });

    return statsByCase;
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
    const recordedScramble = setting.SCRAMBLE || "";
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

    const moveTimeline = providedMoveTimeline || (solveAnalysis && solveAnalysis.moveTimeline) || [];
    const commStats = this.enrichCommStatsWithTiming(
      providedCommStats || (solveAnalysis && solveAnalysis.commStats) || [],
      moveTimeline
    );

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
      link: this.withRecordedScrambleInCubedb(
        data && data.cubedb ? data.cubedb : null,
        recordedScramble,
        setting.SOLVE || null,
        setting.CUBE_OREINTATION || null
      ),
      fluidness:
        parsedMetrics.fluidness !== null && parsedMetrics.fluidness !== undefined
          ? parsedMetrics.fluidness
          : data && data.fluidness !== undefined
            ? data.fluidness
            : null,
      DNF: this.resolveSolveDnf(data, parsedMetrics),
      scramble: recordedScramble,
      solve: (data && data.solve) || (solveAnalysis && solveAnalysis.solve) || setting.SOLVE || "",
      cube_orientation: setting.CUBE_OREINTATION || null,
      comm_stats: commStats,
      move_timeline: moveTimeline,
      parseError,
    };
  };
  getOrientationRotationPrefix = (orientation) => {
    const orientationDict = {
      "white-green": "",
      "white-blue": "y2",
      "white-orange": "y'",
      "white-red": "y",
      "green-white": "y2 x'",
      "green-yellow": "x",
      "green-orange": "x y'",
      "green-red": "x y",
      "yellow-green": "z2",
      "yellow-blue": "x2",
      "yellow-orange": "z2 y",
      "yellow-red": "x2 y",
      "blue-white": "x'",
      "blue-yellow": "x' y2",
      "blue-orange": "x' y'",
      "blue-red": "x' y",
      "orange-white": "z y",
      "orange-green": "z",
      "orange-yellow": "z y'",
      "orange-blue": "y2 z'",
      "red-white": "z' y'",
      "red-green": "z'",
      "red-yellow": "z' y",
      "red-blue": "y2 z'",
    };

    return orientationDict[orientation] || "";
  };

  orientSolveForCubedb = (recordedSolve, orientation) => {
    const rotationPrefix = this.getOrientationRotationPrefix(orientation);
    if (!recordedSolve || !rotationPrefix) {
      return recordedSolve || "";
    }

    const inverseRotationMap = {
      x: "x'",
      "x'": "x",
      x2: "x2",
      y: "y'",
      "y'": "y",
      y2: "y2",
      z: "z'",
      "z'": "z",
      z2: "z2",
    };
    const rotations = rotationPrefix.split(/\s+/).filter(Boolean);
    const solveTokens = recordedSolve.split(/\s+/).filter(Boolean);
    const transformedSolve = rotations
      .map((rotation) => inverseRotationMap[rotation] || rotation)
      .reverse()
      .reduce((tokens, rotation) => this.applyDisplayRotation(tokens, rotation), solveTokens);

    return `${rotations.join(" ")}\n${transformedSolve.join(" ")}`;
  };

  withRecordedScrambleInCubedb = (link, recordedScramble, recordedSolve = null, orientation = null) => {
    if (!link || !recordedScramble) {
      return link || null;
    }

    const orientedSolve = recordedSolve
      ? this.orientSolveForCubedb(recordedSolve, orientation)
      : null;

    try {
      const url = new URL(link);
      if (!url.hostname.toLowerCase().includes("cubedb.net")) {
        return link;
      }

      url.searchParams.set("scramble", recordedScramble);
      if (orientedSolve) {
        url.searchParams.set("alg", orientedSolve);
      }
      return url.toString();
    } catch (_error) {
      const separator = link.includes("?") ? "&" : "?";
      const encodedScramble = new URLSearchParams({ scramble: recordedScramble }).toString();
      const withScramble = link.includes("scramble=")
        ? link.replace(/([?&]scramble=)[^&]*/i, `$1${encodedScramble.replace(/^scramble=/, "")}`)
        : `${link}${separator}${encodedScramble}`;
      if (!orientedSolve) {
        return withScramble;
      }
      const encodedSolve = new URLSearchParams({ alg: orientedSolve }).toString();
      return withScramble.includes("alg=")
        ? withScramble.replace(/([?&]alg=)[^&]*/i, `$1${encodedSolve.replace(/^alg=/, "")}`)
        : `${withScramble}&${encodedSolve}`;
    }
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
  componentDidUpdate = (prevProps, prevState) => {
    if (
      this.state.activeView === "alg-library" &&
      (prevState.activeView !== "alg-library" || prevState.algLibraryPieceType !== this.state.algLibraryPieceType)
    ) {
      this.refreshAlgLibraryEntries().catch((error) => {
        console.warn("Failed to refresh alg library entries", error);
        this.setState({
          algLibraryLoadingEntries: false,
          algLibraryNotice:
            error && error.message ? `Alg Library could not be loaded. ${error.message}` : "Alg Library could not be loaded.",
        });
      });
    }

    if (
      this.state.activeView === "alg-library" &&
      prevState.activeView === "alg-library" &&
      (prevState.algLibrarySearch !== this.state.algLibrarySearch ||
        prevState.algLibraryGroup !== this.state.algLibraryGroup)
    ) {
      this.applyAlgLibraryFilters();
    }

    if (!this.isLiveTimerView()) {
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
    let dnf_arr = arr.map(({ DNF }) => isDnfValue(DNF));
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
      if (isDnfValue(mo3_arr[i]["DNF"])) {
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
        DNF: !isDnfValue(nextSolves[num_solve].DNF),
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
      const isDnf = isDnfValue(DNF);
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
            {isDnf
              ? "DNF(" + this.convert_sec_to_format(time_solve) + ")"
              : this.convert_sec_to_format(time_solve)}{" "}
          </td>
          <td>{this.convert_sec_to_format(memo_time)}</td>
          {/* <td>{exe_time}</td> */}
          <td>
            {!isDnf ? fluidness : ""}
            {fluidness && !isDnf ? "%" : ""}
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
        !isDnfValue(solve_stats[solve_stats.length - 1]["DNF"])
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
        if (cur["best"] < best["best"]["time"] && !isDnfValue(solve_stats[i]["DNF"])) {
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

  getPracticeLabel = (practiceType = this.state.practiceScrambleType) => {
    return practiceType === "corners" ? "Corners only" : "Edges only";
  };

  persistPracticeSolves = (practiceSolves) => {
    const nextSolves = Array.isArray(practiceSolves) ? practiceSolves : [];
    const storageSolves = nextSolves.slice(-PRACTICE_LOCAL_STORAGE_SOLVE_LIMIT);
    const saved = this.safeSetJsonStorage("practiceSolves", storageSolves, "practice solves");

    if (!saved && storageSolves.length > 50) {
      this.safeSetJsonStorage("practiceSolves", storageSolves.slice(-50), "recent practice solves");
    }

    this.setState({ practiceSolves: nextSolves });
  };

  addPracticeSolveToLocalStorage = (data, setting, parseError = null) => {
    const practiceType = (setting && setting.PRACTICE_TYPE) || this.state.practiceScrambleType;
    const solveStats = {
      ...this.buildSolveRecord(data, setting, parseError),
      practice_type: practiceType,
      practice_label: this.getPracticeLabel(practiceType),
    };
    const currentSolves = Array.isArray(this.state.practiceSolves) ? this.state.practiceSolves : [];
    const nextSolves = [...currentSolves, solveStats];
    this.persistPracticeSolves(nextSolves);
    return solveStats;
  };

  safelyStoreSolveResult = (result, setting) => {
    try {
      if (setting && setting.PRACTICE_MODE) {
        this.addPracticeSolveToLocalStorage(result, setting);
        return;
      }

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
      if (setting && setting.PRACTICE_MODE) {
        this.addPracticeSolveToLocalStorage(result, setting, "Server response merge failed");
      } else {
        this.addSolveToLocalStorage(result, setting, "Server response merge failed");
      }
      this.setState({ connectionNotice: null });
    }
  };
  extract_solve_from_cube_moves = (timer_finish) => {
    const storedParseSettings = { ...this.state.parse_settings };
    let parse_setting_new = { ...storedParseSettings };
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
    const isPracticeSolve = this.state.activeView === "practice";
    const plannedScramble = this.getActiveScramble();
    const storedScrambleType = this.getSolveScrambleTypeFromSettings(storedParseSettings);
    parse_setting_new["PLANNED_SCRAMBLE"] = plannedScramble || "";
    parse_setting_new["SCRAMBLE_TYPE"] = isPracticeSolve ? this.state.practiceScrambleType : storedScrambleType;
    parse_setting_new["SCRAMBLE"] = extractedScramble || (hasRecordedCubeMoves ? "" : plannedScramble || "");
    parse_setting_new["SOLVE"] = solve
      .join(" ")
      .toString()
      .replace(/  +/g, " ");
    parse_setting_new["MEMO"] = memo_time.toString();
    parse_setting_new["TIME_SOLVE"] = solve_time.toString();
    // console.log(scramble.length);
    // console.log(this.state.cube_moves_time);

    parse_setting_new["SOLVE_TIME_MOVES"] = JSON.stringify(extracted.solveMoveOffsets);
    parse_setting_new["SAVE_SOLVE"] = !isPracticeSolve;
    parse_setting_new["PRACTICE_MODE"] = isPracticeSolve;
    parse_setting_new["PRACTICE_TYPE"] = isPracticeSolve ? this.state.practiceScrambleType : null;
    parse_setting_new["SESSION_ID"] = !isPracticeSolve && this.isServerSessionId(this.state.activeSessionId)
      ? this.state.activeSessionId
      : null;
    this.setState({ parse_settings: isPracticeSolve ? storedParseSettings : parse_setting_new });
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
        result = data && data.cubedb
          ? {
              ...data,
              cubedb: this.withRecordedScrambleInCubedb(
                data.cubedb,
                setting.SCRAMBLE || "",
                setting.SOLVE || null,
                setting.CUBE_OREINTATION || null
              ),
            }
          : data;
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
  isLiveTimerView = () => {
    return (
      this.state.activeView === "solve" ||
      (this.state.activeView === "practice" && (this.state.practiceTab || "solve") === "solve")
    );
  };

  getSolveScrambleTypeFromSettings = (settings = this.state.parse_settings) => {
    const scrambleType = settings && settings["SCRAMBLE_TYPE"] ? settings["SCRAMBLE_TYPE"] : "3x3";
    return scrambleType === "edges" || scrambleType === "corners" ? "3x3" : scrambleType;
  };

  sanitizeStoredSolveScrambleType = () => {
    const currentType = this.state.parse_settings && this.state.parse_settings["SCRAMBLE_TYPE"];
    const solveScrambleType = this.getSolveScrambleTypeFromSettings(this.state.parse_settings);
    if (currentType === solveScrambleType) {
      return;
    }

    const parse_settings = {
      ...this.state.parse_settings,
      SCRAMBLE_TYPE: solveScrambleType,
    };
    try {
      localStorage.setItem("setting", JSON.stringify(parse_settings));
    } catch (error) {
      console.warn("Failed to sanitize solve scramble type", error);
    }
    this.setState({ parse_settings });
  };

  getActiveScrambleType = (view = this.state.activeView) => {
    return view === "practice"
      ? this.state.practiceScrambleType
      : this.getSolveScrambleTypeFromSettings(this.state.parse_settings);
  };

  getActiveScramble = (view = this.state.activeView) => {
    return view === "practice" ? this.state.practiceScramble || "" : this.state.solveScramble || "";
  };

  handlePracticeScrambleTypeChange = (practiceScrambleType) => {
    this.setState({ practiceScrambleType }, () => this.handle_scramble("practice"));
  };

  handle_scramble = (targetView = this.state.activeView) => {
    const isPracticeScramble = targetView === "practice";
    const scrambleKey = isPracticeScramble ? "practiceScramble" : "solveScramble";
    const lastScrambleKey = isPracticeScramble ? "lastPracticeScramble" : "lastSolveScramble";
    const nextScramble = cubeSolver.scramble(this.getActiveScrambleType(targetView));

    this.setState((prevState) => ({
      last_scramble: prevState[scrambleKey] || prevState.scramble,
      [lastScrambleKey]: prevState[scrambleKey] || "",
      [scrambleKey]: nextScramble,
      scramble: targetView === prevState.activeView ? nextScramble : prevState.scramble,
    }));
  };
  handle_moves_to_show = (cube_moves) => {
    this.handleDrillMoveStream(cube_moves);

    if (this.state.gan) {
      this.setState({ moves_to_show: "" });
    } else if (this.state.solve_status === "Scrambling") {
      this.setState({ moves_to_show: cube_moves.join(" ") });
    } else {
      this.setState({ moves_to_show: "" });
    }
  };
  handle_last_scramble = () => {
    const isPracticeScramble = this.state.activeView === "practice";
    const scrambleKey = isPracticeScramble ? "practiceScramble" : "solveScramble";
    const lastScramble = isPracticeScramble ? this.state.lastPracticeScramble : this.state.lastSolveScramble;
    if (!lastScramble) {
      return;
    }

    this.setState({
      last_scramble: lastScramble,
      [scrambleKey]: lastScramble,
      scramble: lastScramble,
    });
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
      localStorage.removeItem("practiceSolves");
      localStorage.removeItem("setting");
      localStorage.setItem("setting", JSON.stringify(preservedSetting));
      this.persistSessionStorage([freshSession], freshSession.id);
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
          loadingSolveDetailsCommLibrary: false,
          selectedSolveDetails: null,
          selectedSolveCommCard: null,
          solveDetailsLibraryByCase: {},
          solveDetailsCommStatusByKey: {},
          activeView: "solve",
          practiceSolves: [],
          practiceScrambleType: "edges",
          practiceTab: "solve",
          scramble: null,
          solveScramble: null,
          practiceScramble: null,
          last_scramble: null,
          lastSolveScramble: null,
          lastPracticeScramble: null,
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
    const activeScramble = this.getActiveScramble();
    if (!activeScramble || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(activeScramble).catch((error) => {
      console.warn("Failed to copy scramble", error);
    });
  };
  resetBundledAlgLibrary = async () => {
    if (
      !window.confirm(
        "Reset the local alg library to the bundled defaults? This will overwrite any library edits saved on this device."
      )
    ) {
      return;
    }

    this.setState({
      algLibraryImporting: true,
      algLibraryNotice: "Resetting alg library to bundled defaults...",
    });

    try {
      const entries = getBundledAlgLibraryEntries();
      await replaceBundledAlgLibraryEntries(entries);
      await setLocalAppMetaValue("alg_library_seed_version", BUNDLED_ALG_LIBRARY_VERSION);
      const summary = await this.refreshAlgLibrarySummary();
      const totalCount = Array.isArray(summary && summary.counts)
        ? summary.counts.reduce((total, entry) => total + (Number(entry.count) || 0), 0)
        : entries.length;
      if (this.state.activeView === "alg-library") {
        await this.refreshAlgLibraryEntries();
      }

      this.setState({
        algLibraryImporting: false,
        algLibraryNotice: `Reset to ${entries.length} bundled alg library entries. Library now has ${totalCount} saved entries.`,
      });
    } catch (error) {
      console.error("Failed to reset bundled alg library", error);
      const reason =
        error && error.message ? error.message : "The bundled alg library could not be loaded.";
      this.setState({
        algLibraryImporting: false,
        algLibraryNotice: `Bundled alg library reset failed. ${reason}`,
      });
    }
  };

  exportAlgLibrary = async () => {
    try {
      await this.ensureBundledAlgLibraryLoaded({ refreshEntries: false, silent: true });
      const result = await getAlgLibraryEntries({
        pieceType: "all",
        search: "",
        limit: 5000,
      });
      const { exportAlgLibraryWorkbook } = await import("./utils/algWorkbookExport");
      const workbook = exportAlgLibraryWorkbook(Array.isArray(result.entries) ? result.entries : []);
      const file = new Blob([workbook.buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = workbook.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      this.setState({
        algLibraryNotice: `Exported ${workbook.entryCount} alg library entries to ${workbook.fileName}.`,
      });
    } catch (error) {
      this.setState({
        algLibraryNotice:
          error && error.message ? `Export failed. ${error.message}` : "Export failed for the alg library workbook.",
      });
    }
  };
  desktop_layout = () => {
    const accuracyText = this.state.averages.success || "--";
    const ao5Text = this.formatSummaryValue(this.state.averages.ao5);
    const sessions = [...this.state.sessions].sort(
      (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
    );
    const activeSession = this.getActiveSessionFromList(sessions, this.state.activeSessionId);
    const activeSessionSummary = this.getSessionSummary(activeSession);
    const algLibraryCounts = Array.isArray(this.state.algLibrarySummary.counts)
      ? this.state.algLibrarySummary.counts
      : [];
    const algLibraryRecentEntries = Array.isArray(this.state.algLibrarySummary.recentEntries)
      ? this.state.algLibrarySummary.recentEntries
      : [];
    const algLibraryMemoCounts = Array.isArray(this.state.algLibrarySummary.memoCounts)
      ? this.state.algLibrarySummary.memoCounts
      : [];
    const algLibraryEntries = Array.isArray(this.state.algLibraryEntries) ? this.state.algLibraryEntries : [];
    const algLibraryTotal = algLibraryCounts.reduce(
      (total, entry) => total + (Number(entry.count) || 0),
      0
    );
    const algLibrarySelectedEntry =
      algLibraryEntries.find((entry) => entry.id === this.state.algLibrarySelectedEntryId) || null;
    const algLibraryPieceOptions = [
      { value: "all", label: "All" },
      { value: "edge", label: "Edge" },
      { value: "corner", label: "Corner" },
      { value: "twist", label: "Twist" },
      { value: "flip", label: "Flip" },
      { value: "parity", label: "Parity" },
    ];
    const algLibraryTabs = [
      { value: "search", label: "Explore", icon: "explore" },
      { value: "recents", label: "Recents", icon: "recents" },
      { value: "stats", label: "Stats", icon: "stats" },
      { value: "manage", label: "Manage", icon: "manage" },
    ];
    const recentSolves = [...this.state.solves_stats].slice().reverse();
    const algLibraryGroups = Array.from(
      new Set(
        (Array.isArray(this.state.algLibraryAllEntries) ? this.state.algLibraryAllEntries : [])
          .map((entry) => String(entry.category || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    const chartSolves = recentSolves
      .filter(({ DNF, time_solve }) => !isDnfValue(DNF) && Number.isFinite(parseFloat(time_solve)))
      .slice(0, 20);
    const chartTimes = chartSolves.map(({ time_solve }) => parseFloat(time_solve));
    const dnfCount = recentSolves.filter(({ DNF }) => isDnfValue(DNF)).length;
    const completedCount = recentSolves.length - dnfCount;
    const latestSolve = recentSolves[0] || null;
    const practiceSolves = Array.isArray(this.state.practiceSolves) ? this.state.practiceSolves : [];
    const recentPracticeSolves = [...practiceSolves].slice().reverse();
    const latestPracticeSolve = recentPracticeSolves[0] || null;
    const practiceCompletedSolves = recentPracticeSolves.filter(({ DNF }) => !isDnfValue(DNF));
    const practiceValidSolves = recentPracticeSolves.filter(
      ({ DNF, time_solve }) => !isDnfValue(DNF) && Number.isFinite(parseFloat(time_solve))
    );
    const practiceValidTimes = practiceValidSolves.map(({ time_solve }) => parseFloat(time_solve));
    const formatAverageValue = (values) => {
      const validValues = values.filter((value) => Number.isFinite(value));
      if (!validValues.length) {
        return "--";
      }
      return this.convert_sec_to_format(validValues.reduce((total, value) => total + value, 0) / validValues.length);
    };
    const practiceMemoText = latestPracticeSolve ? this.convert_sec_to_format(latestPracticeSolve.memo_time) : "--";
    const practiceExecText = latestPracticeSolve ? this.convert_sec_to_format(latestPracticeSolve.exe_time) : "--";
    const practiceCountLabel = `${practiceSolves.length} ${practiceSolves.length === 1 ? "attempt" : "attempts"}`;
    const practiceAo5Text = formatAverageValue(practiceValidTimes.slice(0, 5));
    const practiceMeanText = formatAverageValue(practiceValidTimes);
    const practiceMemoAvgText = formatAverageValue(practiceValidSolves.map(({ memo_time }) => parseFloat(memo_time)));
    const practiceExecAvgText = formatAverageValue(practiceValidSolves.map(({ exe_time }) => parseFloat(exe_time)));
    const practiceBestSingle = practiceValidTimes.length ? Math.min(...practiceValidTimes) : null;
    const practiceBestText = practiceBestSingle === null ? "--" : this.convert_sec_to_format(practiceBestSingle);
    const practiceDnfCount = recentPracticeSolves.filter(({ DNF }) => isDnfValue(DNF)).length;
    const practiceCompletedCount = practiceCompletedSolves.length;
    const practiceAccuracyText = practiceSolves.length ? `${practiceCompletedCount}/${practiceSolves.length}` : "--";
    const practiceEdgesCount = practiceSolves.filter((solve) => solve.practice_type === "edges").length;
    const practiceCornersCount = practiceSolves.filter((solve) => solve.practice_type === "corners").length;
    const practiceRecentCommHistory = this.getRecentCommHistory(recentPracticeSolves, 8);
    const practiceChartSolves = practiceValidSolves.slice(0, 20);
    const practiceChartTimes = practiceChartSolves.map(({ time_solve }) => parseFloat(time_solve));
    const memoText = latestSolve ? this.convert_sec_to_format(latestSolve.memo_time) : "--";
    const execText = latestSolve ? this.convert_sec_to_format(latestSolve.exe_time) : "--";
    const latestFive = recentSolves.slice(0, 5);
    const recentCommHistory = this.getRecentCommHistory(recentSolves, 8);
    const algLibraryCaseStats = this.getAlgLibraryCaseStatsMap(recentSolves);
    const algLibraryMatchCounts = this.state.algLibraryRecentMatches.reduce(
      (totals, entry) => ({
        ...totals,
        [entry.status]: (totals[entry.status] || 0) + 1,
      }),
      { match: 0, review: 0, missing: 0 }
    );
    const trendLabel =
      latestFive.length >= 2 &&
      !isDnfValue(latestFive[0].DNF) &&
      !isDnfValue(latestFive[latestFive.length - 1].DNF) &&
      Number.isFinite(parseFloat(latestFive[0].time_solve)) &&
      Number.isFinite(parseFloat(latestFive[latestFive.length - 1].time_solve))
        ? parseFloat(latestFive[0].time_solve) <= parseFloat(latestFive[latestFive.length - 1].time_solve)
          ? "Trending faster"
          : "Needs review"
        : "Building data";
    const bestSingle = recentSolves
      .filter(({ DNF, time_solve }) => !isDnfValue(DNF) && Number.isFinite(parseFloat(time_solve)))
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
    const buildChartPath = (times) =>
      times.length > 1
        ? (() => {
            const min = Math.min(...times);
            const max = Math.max(...times);
            const spread = Math.max(max - min, 0.01);
            return times
              .map((value, index) => {
                const x = (index / (times.length - 1)) * 100;
                const y = 100 - ((value - min) / spread) * 72 - 14;
                return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
              })
              .join(" ");
          })()
        : "";
    const chartPath = buildChartPath(chartTimes);
    const practiceChartPath = buildChartPath(practiceChartTimes);
    const viewConfig = {
      solve: {
        title: "Solve",
        eyebrow: "Live Session",
        heading: "Timer, scramble, and smart-cube flow stay front and center here.",
        body: null,
      },
      practice: {
        title: "Practise",
        eyebrow: "Practise",
        heading: "Edges-only and corners-only solves live separately from normal sessions.",
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
      "alg-library": {
        title: "Alg Library",
        eyebrow: "Alg Library",
        heading: "Search, review, and update your preferred comms without leaving the app.",
        body: "Use the library tabs to search comms, review recent cases, and maintain your local data.",
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
    const selectedSolveDetailsPool =
      this.state.selectedSolveDetails && this.state.selectedSolveDetails.practice_type
        ? practiceSolves
        : activeSession && Array.isArray(activeSession.solves)
          ? activeSession.solves
          : [];
    const selectedSolveDetailsData = this.getSolveDetailsViewData(
      this.state.selectedSolveDetails,
      selectedSolveDetailsPool
    );
    const selectedSolveCommLookup = this.state.selectedSolveCommCard
      ? this.getSolveDetailsCommLookup(this.state.selectedSolveCommCard)
      : null;
    const selectedSolveCommEntry = selectedSolveCommLookup
      ? this.state.solveDetailsLibraryByCase[
          this.buildSolveDetailsCaseKey(selectedSolveCommLookup.pieceType, selectedSolveCommLookup.caseCode)
        ] || null
      : null;
    const selectedSolveCommStatus = this.state.selectedSolveCommCard
      ? this.state.solveDetailsCommStatusByKey[this.getSolveDetailsCommRowKey(this.state.selectedSolveCommCard)] || null
      : null;
    const selectedSolveCommCardData = this.state.selectedSolveCommCard && selectedSolveCommLookup
      ? {
          label: selectedSolveCommLookup.label,
          pieceType: selectedSolveCommLookup.pieceType,
          category: selectedSolveCommEntry ? this.formatAlgLibraryCategory(selectedSolveCommEntry.category) : "",
          memoWord: selectedSolveCommEntry ? selectedSolveCommEntry.memo_word || "" : "",
          description: selectedSolveCommEntry
            ? selectedSolveCommEntry.description || "No description saved yet"
            : "No library entry saved for this comm.",
          preferredAlg: selectedSolveCommEntry
            ? this.formatAlgLibraryAlg(
                selectedSolveCommEntry.alg || "",
                selectedSolveCommEntry.piece_type
              ) || "--"
            : "--",
          usedAlg:
            this.formatAlgLibraryAlg(
              this.state.selectedSolveCommCard.alg || "",
              selectedSolveCommLookup.pieceType
            ) || "--",
          status: selectedSolveCommStatus,
          timing: this.formatCommTimingPair(this.state.selectedSolveCommCard) || "--",
        }
      : null;
    const selectedSolveMemoData = selectedSolveDetailsData
      ? this.getSolveDetailsMemoLines(selectedSolveDetailsData)
      : null;
    const lastSolvePanelData = this.getLastSolvePanelData(latestSolve);
    const lastPracticePanelData = this.getLastSolvePanelData(latestPracticeSolve);
    const timerDisplayMs = this.getTimerDisplayMs(
      this.state.activeView === "practice" ? latestPracticeSolve : latestSolve
    );
    let mainView;

    if (this.state.activeView === "drill") {
      const drillOptions = this.getDrillPieceTypeOptions();
      const selectedDrillTypes = Array.isArray(this.state.drillPieceTypes) ? this.state.drillPieceTypes : [];
      const reviewMode = this.state.drillMode === "alg-review";
      const activeDrillPromptEntry = this.getActiveDrillPromptEntry();
      const activeDrillPrompt = reviewMode
        ? this.buildAlgReviewPromptText(activeDrillPromptEntry)
        : this.buildDrillPromptText(activeDrillPromptEntry);
      const activeReviewEntry = this.state.drillExecutingEntry || activeDrillPromptEntry;
      const currentDrillMoves = Array.isArray(this.state.drillCurrentMoves) ? this.state.drillCurrentMoves.join(" ") : "";
      const nextPrompt = this.buildDrillPromptText(this.state.drillNextEntry);
      const algReviewGroups = Array.isArray(this.state.algReviewGroups) ? this.state.algReviewGroups : [];
      const algReviewRecords = Array.isArray(this.state.algReviewAttemptRecords) ? this.state.algReviewAttemptRecords : [];
      const algReviewRetries = algReviewRecords.reduce((total, record) => total + (Number(record.retries) || 0), 0);
      const algReviewProgress = this.state.algReviewProgress || this.parseJsonStorage("algReviewProgress", null);
      const activeEditorEntry = this.state.algReviewEditorEntry;
      const editorDraft = this.state.algReviewEditorDraft;
      mainView = (
        <section className={`drill_screen view_panel ${this.state.drillSessionActive ? "drill_screen_active" : ""} ${reviewMode ? "drill_screen_review_mode" : ""}`}>
          {this.state.drillSessionActive ? (
            <React.Fragment>
              <button type="button" className="drill_close_button" onClick={this.endDrillSession} aria-label="End drill">
                x
              </button>
              <article className="drill_prompt_card drill_prompt_card_active">
                <div className="drill_prompt_eyebrow">
                  {reviewMode ? "Alg Review" : this.getActiveDrillPromptLabel()}
                </div>
                <div className="drill_prompt_word">
                  {activeDrillPromptEntry
                    ? activeDrillPrompt
                    : this.state.drillExecutingEntry
                      ? "Finish"
                      : "Done"}
                </div>
                {reviewMode && this.state.algReviewPeekVisible && activeReviewEntry ? (
                  <div className="drill_peek_panel">
                    <div>{activeReviewEntry.case_code || "--"}</div>
                    <span>{activeReviewEntry.description || "No comm notation saved"}</span>
                    <span>{activeReviewEntry.alg || "No alg saved"}</span>
                  </div>
                ) : null}
                <div className="drill_prompt_hint">
                  {this.state.drillStatusMessage || "Turn to start"}
                  {!reviewMode && this.state.drillNextEntry ? ` | Up next: ${nextPrompt}` : ""}
                </div>
                <div className={`drill_prompt_actions ${reviewMode ? "drill_prompt_actions_review" : "drill_prompt_actions_active"}`}>
                  {reviewMode ? (
                    <React.Fragment>
                      <button type="button" className="drill_action_button drill_action_button_secondary" onClick={this.retryDrillEntry}>
                        Retry
                      </button>
                      <button type="button" className="drill_action_button drill_action_button_secondary" onClick={this.toggleAlgReviewPeek}>
                        Peek
                      </button>
                      <button
                        type="button"
                        className="drill_action_button drill_action_button_secondary"
                        onClick={() => this.openAlgReviewEditor(activeReviewEntry)}
                        disabled={!activeReviewEntry}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="drill_action_button drill_action_button_secondary"
                        onClick={() => this.advanceDrillSession({ skipped: true })}
                      >
                        Skip
                      </button>
                      <button type="button" className="drill_action_button drill_action_button_secondary" onClick={this.pauseDrillSession}>
                        Pause
                      </button>
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <button
                        type="button"
                        className="drill_action_button drill_action_button_secondary"
                        onClick={() => this.advanceDrillSession({ skipped: true })}
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        className="drill_action_button drill_action_button_secondary"
                        onClick={() => this.advanceDrillSession({ missed: true })}
                      >
                        Missed
                      </button>
                    </React.Fragment>
                  )}
                </div>
              </article>
              <div className="drill_fullscreen_stats">
                <span>{this.state.drillCompletedCount} done</span>
                <span>{this.state.drillSkippedCount} skipped</span>
                <span>{reviewMode ? `${algReviewRetries} retries` : `${this.state.drillReviewEntries.length} review`}</span>
              </div>
              <div className="drill_review_strip">
                {this.state.drillReviewEntries.length
                  ? this.state.drillReviewEntries
                      .map((entry) => `${entry.case_code}${entry.misses > 1 ? ` x${entry.misses}` : ""}`)
                      .join(", ")
                  : reviewMode
                    ? "Retries and missed algs will collect here"
                    : "Missed algs will collect here"}
              </div>
              {reviewMode ? (
                <div className="drill_current_moves_bar">
                  <span>Current moves</span>
                  <strong>{currentDrillMoves || "..."}</strong>
                </div>
              ) : null}
            </React.Fragment>
          ) : (
          <React.Fragment>
          <div className="section_header">
            <div>
              <div className="placeholder_title">Drill</div>
              <div className="placeholder_text">
                {reviewMode
                  ? "Pick a set, then practise the algs from memo prompts with retries, peeks, edits, and saved progress."
                  : "Pick the sets you want, then cycle memo prompts while logging skips and misses for review."}
              </div>
            </div>
            <div className="section_meta">
              {reviewMode
                ? `${this.getAlgReviewGroupLabel(this.state.algReviewGroup)} ${this.state.algReviewPieceType}`
                : `${selectedDrillTypes.length} set${selectedDrillTypes.length === 1 ? "" : "s"} selected`}
            </div>
          </div>
          <div className="drill_tabs drill_mode_tabs">
            <button
              type="button"
              className={`drill_tab ${!reviewMode ? "drill_tab_active" : ""}`}
              onClick={() => this.setDrillMode("memo-flow")}
            >
              Memo Flow
            </button>
            <button
              type="button"
              className={`drill_tab ${reviewMode ? "drill_tab_active" : ""}`}
              onClick={() => this.setDrillMode("alg-review")}
            >
              Alg Review
            </button>
          </div>
          {reviewMode ? (
            <React.Fragment>
              <div className="drill_review_setup">
                <label className="drill_select_label">
                  Type
                  <select
                    className="drill_select"
                    value={this.state.algReviewPieceType}
                    onChange={(event) => this.setAlgReviewPieceType(event.target.value)}
                  >
                    {drillOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="drill_select_label">
                  Subset
                  <select
                    className="drill_select"
                    value={this.state.algReviewGroup}
                    onFocus={() => this.loadAlgReviewOptions().catch((error) => console.warn("Failed to load alg review groups", error))}
                    onChange={(event) => this.setState({ algReviewGroup: event.target.value })}
                  >
                    <option value="all">All</option>
                    {algReviewGroups.map((group) => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="drill_action_button drill_action_button_secondary"
                  onClick={() => this.loadAlgReviewOptions()}
                  disabled={this.state.drillLoading}
                >
                  Load Sets
                </button>
              </div>
              <div className="drill_card_list">
                <article className="drill_card drill_review_card">
                  <div>
                    <div className="drill_card_title">Alg Review</div>
                    <div className="drill_card_text">
                      Random memo prompts from {this.getAlgReviewGroupLabel(this.state.algReviewGroup)}. Retry keeps the same prompt without asking you to solve the cube first.
                    </div>
                    <div className="drill_review_mini_stats">
                      <span>{algReviewRecords.length} attempts saved</span>
                      <span>{algReviewRetries} retries</span>
                    </div>
                  </div>
                  <div className="drill_card_side">
                    <div className="drill_badge">{this.state.algReviewPieceType}</div>
                    <button type="button" className="drill_action_button" onClick={this.startDrillSession} disabled={this.state.drillLoading}>
                      {this.state.drillLoading ? "Loading..." : "Start Review"}
                    </button>
                    {algReviewProgress ? (
                      <button type="button" className="drill_action_button drill_action_button_secondary" onClick={this.resumeAlgReviewProgress}>
                        Resume
                      </button>
                    ) : null}
                  </div>
                </article>
              </div>
              <div className="drill_review_strip drill_review_recent">
                {algReviewRecords.length
                  ? algReviewRecords
                      .slice(-4)
                      .reverse()
                      .map((record) => `${record.caseCode || "--"}: ${this.formatDrillSeconds(record.recogTime)} / ${this.formatDrillSeconds(record.execTime)}${record.retries ? `, r${record.retries}` : ""}`)
                      .join(" | ")
                  : "Review timings will appear here"}
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div className="drill_filter_group">
                <span className="drill_filter_label">Include Sets</span>
                <div className="drill_filter_chips">
                  {drillOptions.map((option) => {
                    const active = selectedDrillTypes.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`drill_chip ${active ? "drill_chip_active" : ""}`}
                        onClick={() => this.toggleDrillPieceType(option.value)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="drill_filter_group">
                <span className="drill_filter_label">Prompt Mode</span>
                <div className="drill_mode_toggle">
                  <button
                    type="button"
                    className={`drill_chip ${this.state.drillDisplayMode === "current" ? "drill_chip_active" : ""}`}
                    onClick={() => this.setState({ drillDisplayMode: "current" })}
                  >
                    Current
                  </button>
                  <button
                    type="button"
                    className={`drill_chip ${this.state.drillDisplayMode === "next" ? "drill_chip_active" : ""}`}
                    onClick={() => this.setState({ drillDisplayMode: "next" })}
                  >
                    Think Ahead
                  </button>
                </div>
              </div>
              <div className="drill_card_list">
                <article className="drill_card">
                  <div>
                    <div className="drill_card_title">Memo Flow Drill</div>
                    <div className="drill_card_text">
                      Starts with a memo word, then lets you advance to the next prompt the moment you begin the alg. Skips and misses are tracked separately.
                    </div>
                  </div>
                  <div className="drill_card_side">
                    <div className="drill_badge">{selectedDrillTypes.join(", ") || "None"}</div>
                    <button type="button" className="drill_action_button" onClick={this.startDrillSession} disabled={this.state.drillLoading}>
                      {this.state.drillLoading ? "Loading..." : "Start Drill"}
                    </button>
                  </div>
                </article>
              </div>
            </React.Fragment>
          )}
          </React.Fragment>
          )}
          {editorDraft && activeEditorEntry ? (
            <div className="alg_review_editor_overlay">
              <div className="alg_review_editor_card">
                <div className="drill_card_title">Edit {activeEditorEntry.case_code}</div>
                <div className="solve_comm_editor_pair">
                  <input
                    type="text"
                    className="settings_input alg_library_inline_input"
                    placeholder="Category"
                    value={editorDraft.category || ""}
                    onChange={(event) => this.updateAlgReviewEditorDraftField("category", event.target.value)}
                  />
                  <input
                    type="text"
                    className="settings_input alg_library_inline_input"
                    placeholder="Memo"
                    value={editorDraft.memoWord || ""}
                    onChange={(event) => this.updateAlgReviewEditorDraftField("memoWord", event.target.value)}
                  />
                </div>
                <textarea
                  className="settings_textarea alg_library_inline_textarea"
                  placeholder="Description"
                  value={editorDraft.description || ""}
                  onChange={(event) => this.updateAlgReviewEditorDraftField("description", event.target.value)}
                />
                <textarea
                  className="settings_textarea alg_library_inline_textarea"
                  placeholder="Alg"
                  value={editorDraft.alg || ""}
                  onChange={(event) => this.updateAlgReviewEditorDraftField("alg", event.target.value)}
                />
                <textarea
                  className="settings_textarea alg_library_inline_textarea"
                  placeholder="Notes"
                  value={editorDraft.notes || ""}
                  onChange={(event) => this.updateAlgReviewEditorDraftField("notes", event.target.value)}
                />
                <div className="alg_review_editor_actions">
                  <button type="button" className="drill_action_button drill_action_button_secondary" onClick={this.closeAlgReviewEditor}>
                    Cancel
                  </button>
                  <button type="button" className="drill_action_button" onClick={this.saveAlgReviewEditor} disabled={this.state.algReviewEditorSaving}>
                    {this.state.algReviewEditorSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      );    } else if (this.state.activeView === "study") {
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
            <div className="section_meta">{algLibraryTotal ? `${algLibraryTotal} saved comms` : "Saved drill stacks"}</div>
          </div>
          <div className="study_library_grid">
            <article className="study_library_card">
              <div className="study_library_title">Alg Library</div>
              <div className="study_library_text">
                Browse the locally bundled corners, edges, linked memo words, and parity library from the dedicated Alg Library screen.
              </div>
              <div className="study_library_action_row">
                <button
                  type="button"
                  className="study_library_button"
                  onClick={() => this.setState({ activeView: "alg-library" })}
                >
                  Open Alg Library
                </button>
              </div>
              {this.state.algLibraryNotice ? (
                <div className="study_library_notice">{this.state.algLibraryNotice}</div>
              ) : null}
            </article>
            <article className="study_library_card">
              <div className="study_library_title">Recent Library Entries</div>
              <div className="study_library_text">
                {algLibraryCounts.length
                  ? algLibraryCounts
                      .map((entry) => `${entry.piece_type}: ${entry.count}`)
                      .join(" | ")
                  : "Load the bundled library to start building a searchable comm library."}
              </div>
              {algLibraryRecentEntries.length ? (
                <div className="study_library_entry_list">
                  {algLibraryRecentEntries.map((entry) => (
                    <div key={entry.id} className="study_library_entry">
                      <div className="study_library_entry_header">
                        <strong>{entry.case_code}</strong>
                        <span>{entry.piece_type}</span>
                      </div>
                      <div className="study_library_entry_alg">{entry.description}</div>
                      {entry.memo_word ? <div className="study_library_entry_alg">Memo: {entry.memo_word}</div> : null}
                      {entry.alg ? <div className="study_library_entry_alg">{entry.alg}</div> : null}
                      {entry.category ? (
                        <div className="study_library_entry_alg">Category: {this.formatAlgLibraryCategory(entry.category)}</div>
                      ) : null}
                      {entry.notes ? <div className="study_library_entry_alg">Notes: {entry.notes}</div> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          </div>
        </section>
      );
    } else if (this.state.activeView === "alg-library") {
      mainView = (
        <section className="study_screen view_panel">
          {this.state.algLibraryTab === "stats" ? (
          <div className="stats_breakdown_grid">
            <div className="breakdown_card">
              <span>Total Saved</span>
              <strong>{algLibraryTotal || "--"}</strong>
            </div>
            <div className="breakdown_card">
              <span>Recent Matches</span>
              <strong>
                {algLibraryMatchCounts.match || "--"}
              </strong>
            </div>
            <div className="breakdown_card">
              <span>Needs Review</span>
              <strong>
                {algLibraryMatchCounts.review || "--"}
              </strong>
            </div>
            <div className="breakdown_card">
              <span>Missing Cases</span>
              <strong>
                {algLibraryMatchCounts.missing || "--"}
              </strong>
            </div>
            <div className="breakdown_card">
              <span>Corner Memos</span>
              <strong>
                {(algLibraryMemoCounts.find((entry) => entry.piece_type === "corner") || {}).count || "--"}
              </strong>
            </div>
            <div className="breakdown_card">
              <span>Edge Memos</span>
              <strong>
                {(algLibraryMemoCounts.find((entry) => entry.piece_type === "edge") || {}).count || "--"}
              </strong>
            </div>
          </div>
          ) : null}
          {this.state.algLibraryTab === "manage" ? (
          <React.Fragment>
          <div className="study_library_grid">
            <article className="study_library_card">
              <div className="study_library_title">Reset to Defaults</div>
              <div className="study_library_text">
                This rebuilds the local library from the bundled defaults and overwrites saved edits on this device.
              </div>
              <div className="study_library_action_row">
                <button
                  type="button"
                  className="study_library_button"
                  onClick={this.resetBundledAlgLibrary}
                  disabled={this.state.algLibraryImporting}
                >
                  {this.state.algLibraryImporting ? "Resetting..." : "Reset Library to Default"}
                </button>
              </div>
              {this.state.algLibraryNotice ? (
                <div className="study_library_notice">{this.state.algLibraryNotice}</div>
              ) : null}
            </article>
            <article className="study_library_card">
              <div className="study_library_title">Export Library</div>
              <div className="study_library_text">
                Download the current local library as a workbook with separate sheets for edges, corners, twists, flips, and parity.
              </div>
              <div className="study_library_action_row">
                <button type="button" className="study_library_button" onClick={this.exportAlgLibrary}>
                  Export Library Workbook
                </button>
              </div>
            </article>
            <article className="study_library_card">
              <div className="study_library_title">Updated Entries</div>
              <div className="study_library_text">
                {algLibraryCounts.length
                  ? algLibraryCounts.map((entry) => `${entry.piece_type}: ${entry.count}`).join(" | ")
                  : "The library will summarize itself here after the bundled dataset finishes loading."}
              </div>
              <div className="alg_library_detail_grid">
                <div className="alg_library_detail_block">
                  <span>Total Comms</span>
                  <strong>{algLibraryTotal || "--"}</strong>
                </div>
                <div className="alg_library_detail_block">
                  <span>Recent Imports</span>
                  <strong>{algLibraryRecentEntries.length || "--"}</strong>
                </div>
              </div>
              {algLibraryRecentEntries.length ? (
                <div className="study_library_entry_list">
                  {algLibraryRecentEntries.map((entry) => (
                    <div key={entry.id} className="study_library_entry">
                      <div className="study_library_entry_header">
                        <strong>{entry.case_code}</strong>
                        <span>{entry.piece_type}</span>
                      </div>
                      <div className="study_library_entry_alg">
                        {(entry.memo_word || "--")}{entry.category ? ` | ${this.formatAlgLibraryCategory(entry.category)}` : ""}
                      </div>
                      <div className="study_library_entry_alg">{entry.description || "--"}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          </div>
          </React.Fragment>
          ) : null}
          {this.state.algLibraryTab === "search" ? (
          <React.Fragment>
          <div className="alg_library_toolbar alg_library_toolbar_flat">
            <div className="alg_library_control_grid alg_library_control_grid_compact">
              <label className="alg_library_field">
                <span>Type</span>
                <select
                  className="settings_input alg_library_select"
                  value={this.state.algLibraryPieceType}
                  onChange={(event) =>
                    this.setState({
                      algLibraryPieceType: event.target.value,
                      algLibraryGroup: "all",
                    })
                  }
                >
                  {algLibraryPieceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="alg_library_field">
                <span>Group</span>
                <select
                  className="settings_input alg_library_select"
                  value={this.state.algLibraryGroup}
                  onChange={(event) => this.setState({ algLibraryGroup: event.target.value })}
                >
                  <option value="all">All</option>
                  {algLibraryGroups.map((group) => (
                    <option key={group} value={group}>
                      {this.formatAlgLibraryCategory(group)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="alg_library_field">
                <span>Name</span>
                <input
                  type="text"
                  className="settings_input alg_library_search alg_library_search_compact"
                  placeholder=""
                  value={this.state.algLibrarySearch}
                  onChange={(event) => this.setState({ algLibrarySearch: event.target.value })}
                />
              </label>
            </div>
          </div>
          <div className="alg_library_results alg_library_results_flat">
            {this.state.algLibraryLoadingEntries ? (
              <div className="empty_state_card">
                <div className="placeholder_text">Loading your Alg Library entries...</div>
              </div>
            ) : algLibraryEntries.length ? (
              algLibraryEntries.map((entry) => {
                const isEditing = this.state.algLibraryEditing && algLibrarySelectedEntry && algLibrarySelectedEntry.id === entry.id;
                const stats = algLibraryCaseStats.get(`${entry.piece_type}:${entry.case_code}`);
                const avgExec = stats && stats.execCount
                  ? this.formatInlineDuration(stats.execTotal / stats.execCount)
                  : null;

                return (
                  <article
                    key={entry.id}
                    className={`study_library_card alg_library_entry_card ${isEditing ? "alg_library_entry_card_editing" : ""}`}
                  >
                    <div className="alg_library_card_top">
                      <strong>{entry.case_code}</strong>
                      <span>
                        {entry.piece_type
                          ? `${entry.piece_type.charAt(0).toUpperCase()}${entry.piece_type.slice(1)}`
                          : ""}
                      </span>
                    </div>
                    {isEditing ? (
                      <React.Fragment>
                        <div className="alg_library_card_meta alg_library_card_meta_editing">
                          <input
                            type="text"
                            className="settings_input alg_library_inline_input"
                            placeholder="Category"
                            value={this.state.algLibraryDraft ? this.state.algLibraryDraft.category : ""}
                            onChange={(event) => this.updateAlgLibraryDraftField("category", event.target.value)}
                          />
                          <input
                            type="text"
                            className="settings_input alg_library_inline_input"
                            placeholder="Memo"
                            value={this.state.algLibraryDraft ? this.state.algLibraryDraft.memoWord : ""}
                            onChange={(event) => this.updateAlgLibraryDraftField("memoWord", event.target.value)}
                          />
                        </div>
                        <div className="alg_library_card_desc alg_library_card_desc_editing">
                          <textarea
                            className="settings_textarea alg_library_inline_textarea"
                            placeholder="Description"
                            value={this.state.algLibraryDraft ? this.state.algLibraryDraft.description : ""}
                            onChange={(event) => this.updateAlgLibraryDraftField("description", event.target.value)}
                          />
                        </div>
                        <div className="alg_library_card_alg">
                          <textarea
                            className="settings_textarea alg_library_inline_textarea"
                            placeholder="Alg"
                            value={this.state.algLibraryDraft ? this.state.algLibraryDraft.alg : ""}
                            onChange={(event) => this.updateAlgLibraryDraftField("alg", event.target.value)}
                          />
                          <button
                            type="button"
                            className="alg_library_icon_button alg_library_icon_button_small"
                            onClick={this.saveAlgLibraryEntry}
                            disabled={this.state.algLibrarySavingEntry}
                            aria-label="Save entry"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m5 13 4 4L19 7" />
                            </svg>
                          </button>
                        </div>
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <div className="alg_library_card_meta">
                          <span>
                            {this.formatAlgLibraryCategory(entry.category)}
                          </span>
                          <span>
                            {entry.memo_word || ""}
                          </span>
                        </div>
                        <div className="alg_library_card_desc">
                          <span>{entry.description || "No description saved yet"}</span>
                          <span>{avgExec || ""}</span>
                        </div>
                        <div className="alg_library_card_alg">
                          <span>{entry.alg || "--"}</span>
                          <button
                            type="button"
                            className="alg_library_icon_button alg_library_icon_button_small"
                            onClick={() => this.openAlgLibraryEditorForEntry(entry)}
                            aria-label="Edit entry"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                        </div>
                      </React.Fragment>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="empty_state_card">
                <div className="placeholder_text">No entries matched this filter yet.</div>
              </div>
            )}
          </div>
          </React.Fragment>
          ) : null}
          {this.state.algLibraryTab === "recents" ? (
          <React.Fragment>
          <div className="alg_library_results alg_library_results_flat">
            {this.state.algLibraryRecentMatches.length ? (
              this.state.algLibraryRecentMatches.map((entry) => {
                const preferredAlg = entry.preferredEntry
                  ? this.formatAlgLibraryAlg(
                      entry.preferredEntry.alg || "",
                      entry.preferredEntry.piece_type
                    ) || "--"
                  : "--";
                const usedAlg = this.formatAlgLibraryAlg(entry.algUsed || "", entry.pieceType) || "--";
                const preferredStatus = entry.preferredEntry
                  ? entry.status === "match"
                    ? "Matches preferred alg"
                    : "Different from preferred"
                  : "No preferred alg saved";

                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="alg_library_match_button alg_library_entry_card alg_library_recent_card"
                    onClick={() => {
                      if (entry.preferredEntry) {
                        this.jumpToAlgLibraryEntry(entry.preferredEntry);
                      } else {
                        this.setState({
                          algLibraryTab: "search",
                          algLibraryPieceType: entry.pieceType,
                          algLibrarySearch: entry.caseCode,
                          algLibraryEditing: false,
                        });
                      }
                    }}
                  >
                    <div className="alg_library_card_top">
                      <strong>{entry.caseCode}</strong>
                      <span>
                        {entry.pieceType
                          ? `${entry.pieceType.charAt(0).toUpperCase()}${entry.pieceType.slice(1)}`
                          : ""}
                      </span>
                    </div>
                    <div className="alg_library_card_meta">
                      <span>
                        {entry.preferredEntry
                          ? this.formatAlgLibraryCategory(entry.preferredEntry.category)
                          : ""}
                      </span>
                      <span>{entry.preferredEntry ? entry.preferredEntry.memo_word || "" : ""}</span>
                    </div>
                    <div className="alg_library_card_desc">
                      <span>{usedAlg}</span>
                      <span>
                        {preferredStatus}
                      </span>
                    </div>
                    <div className="alg_library_card_alg">
                      <span>{preferredAlg}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="empty_state_card">
                <div className="placeholder_text">
                  Once recent solves contain parsed edge, corner, or parity cases, they will show up here for comparison.
                </div>
              </div>
            )}
          </div>
          </React.Fragment>
          ) : null}
          {this.state.algLibraryTab === "stats" ? (
          <React.Fragment>
          <div className="study_library_grid">
            <article className="study_library_card">
              <div className="study_library_title">Library Summary</div>
              <div className="study_library_text">
                {algLibraryCounts.length
                  ? algLibraryCounts
                      .map((entry) => `${entry.piece_type}: ${entry.count}`)
                      .join(" | ")
                  : "Load the bundled library to start building a searchable comm library."}
              </div>
            </article>
            <article className="study_library_card">
              <div className="study_library_title">Recent Performance</div>
              {recentCommHistory.length ? (
                <div className="stats_comm_list">
                  {recentCommHistory.map((entry) => (
                    <article key={`${entry.phase}-${entry.token}`} className="stats_comm_card">
                      <div className="stats_comm_identity">
                        <div className="stats_comm_title_row">
                          <div className="stats_comm_token">{entry.token}</div>
                          <div className={`stats_comm_phase stats_comm_phase_${entry.phase}`}>{entry.phase}</div>
                        </div>
                        <div className="stats_comm_meta">
                          Seen {entry.count} {entry.count === 1 ? "time" : "times"}
                          {entry.lastSeen ? ` | ${formatHistoryDate(entry.lastSeen)}` : ""}
                        </div>
                      </div>
                      <div className="stats_comm_metrics">
                        <div className="stats_comm_metric">
                          <span>Recog</span>
                          <strong>{this.formatInlineDuration(entry.avgRecog) || "--"}</strong>
                        </div>
                        <div className="stats_comm_metric">
                          <span>Exec</span>
                          <strong>{this.formatInlineDuration(entry.avgExec) || "--"}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="study_library_text">
                  Parsed comm stats will start appearing here once you log a few reviewed solves.
                </div>
              )}
            </article>
          </div>
          </React.Fragment>
          ) : null}
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
                    <div className="history_card_title">{this.formatSolveResultLabel(solve)}</div>
                    <div className="history_card_subtitle history_split_times">
                      {this.convert_sec_to_format(solve.memo_time)} | {this.convert_sec_to_format(solve.exe_time)}
                    </div>
                  </div>
                  <div className="history_solve_row history_solve_row_meta">
                    {(() => {
                      const tag = this.getSolveHistoryTag(
                        solve,
                        activeSession && Array.isArray(activeSession.solves) ? activeSession.solves : []
                      );
                      return (
                        <div className="history_card_subtitle history_solve_tag">
                          <span>{tag.prefix}</span>
                          {tag.reason ? <em>{tag.reason}</em> : null}
                        </div>
                      );
                    })()}
                    <div className="history_card_subtitle">{formatHistoryDate(solve.date)}</div>
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
            <div className="chart_card">
              <div className="chart_card_header">
                <div>
                  <div className="chart_card_title">Recent Comm History</div>
                  <div className="study_stat_caption">Most frequent parsed cases from recent solves</div>
                </div>
                <div className="section_meta">{recentCommHistory.length ? `${recentCommHistory.length} tracked` : "No comms yet"}</div>
              </div>
              {recentCommHistory.length ? (
                <div className="stats_comm_list">
                  {recentCommHistory.map((entry) => (
                    <article key={`${entry.phase}-${entry.token}`} className="stats_comm_card">
                      <div className="stats_comm_identity">
                        <div className="stats_comm_title_row">
                          <div className="stats_comm_token">{entry.token}</div>
                          <div className={`stats_comm_phase stats_comm_phase_${entry.phase}`}>{entry.phase}</div>
                        </div>
                        <div className="stats_comm_meta">
                          Seen {entry.count} {entry.count === 1 ? "time" : "times"}
                          {entry.lastSeen ? ` • ${formatHistoryDate(entry.lastSeen)}` : ""}
                        </div>
                      </div>
                      <div className="stats_comm_metrics">
                        <div className="stats_comm_metric">
                          <span>Recog</span>
                          <strong>{this.formatInlineDuration(entry.avgRecog) || "--"}</strong>
                        </div>
                        <div className="stats_comm_metric">
                          <span>Exec</span>
                          <strong>{this.formatInlineDuration(entry.avgExec) || "--"}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty_state_card">
                  <div className="placeholder_eyebrow">Stats</div>
                  <div className="placeholder_text">
                    Parsed comm history will start appearing here once you log a few reviewed solves.
                  </div>
                </div>
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
    } else if (this.state.activeView === "practice") {
      const practiceTab = this.state.practiceTab || "solve";

      if (practiceTab === "history") {
        mainView = (
          <section className="history_screen view_panel">
            <div className="history_header">
              <div>
                <div className="placeholder_title">Practise History</div>
                <div className="placeholder_text">Edges-only and corners-only attempts only.</div>
              </div>
              <div className="history_solve_count">{practiceCountLabel}</div>
            </div>
            <div className="history_list">
              {recentPracticeSolves.length ? (
                recentPracticeSolves.map((solve, index) => (
                  <button
                    key={solve.date || index}
                    type="button"
                    className="history_card history_card_button"
                    onClick={() => this.openSolveDetails(solve)}
                  >
                    <div className="history_solve_row">
                      <div className="history_card_title">{this.formatSolveResultLabel(solve)}</div>
                      <div className="history_card_subtitle history_split_times">
                        {this.convert_sec_to_format(solve.memo_time)} | {this.convert_sec_to_format(solve.exe_time)}
                      </div>
                    </div>
                    <div className="history_solve_row history_solve_row_meta">
                      {(() => {
                        const tag = this.getSolveHistoryTag(solve, practiceSolves);
                        const label = solve.practice_label || this.getPracticeLabel(solve.practice_type);
                        const status = `${tag.prefix}${tag.reason ? ` ${tag.reason}` : ""}`;
                        return (
                          <div className="history_card_subtitle history_solve_tag">
                            <span>{label}</span>
                            <em>{status}</em>
                          </div>
                        );
                      })()}
                      <div className="history_card_subtitle">{formatHistoryDate(solve.date)}</div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty_state_card">
                  <div className="placeholder_eyebrow">Practise</div>
                  <div className="placeholder_text">
                    Complete an edges-only or corners-only solve and it will appear here.
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      } else if (practiceTab === "stats") {
        mainView = (
          <section className="stats_screen view_panel">
            <div className="stats_header">
              <div>
                <div className="placeholder_title">Practise Stats</div>
                <div className="placeholder_text">Only practise solves are included here.</div>
              </div>
              <div className="section_meta">{practiceCompletedCount} completed</div>
            </div>
            <div className="stats_grid">
              <div className="stats_tile">
                <span>Ao5</span>
                <strong>{practiceAo5Text}</strong>
              </div>
              <div className="stats_tile">
                <span>Mean</span>
                <strong>{practiceMeanText}</strong>
              </div>
              <div className="stats_tile">
                <span>Best</span>
                <strong>{practiceBestText}</strong>
              </div>
              <div className="stats_tile">
                <span>Success</span>
                <strong>{practiceAccuracyText}</strong>
              </div>
            </div>
            <div className="stats_breakdown_grid">
              <div className="breakdown_card">
                <span>Memo Avg</span>
                <strong>{practiceMemoAvgText}</strong>
              </div>
              <div className="breakdown_card">
                <span>Exec Avg</span>
                <strong>{practiceExecAvgText}</strong>
              </div>
              <div className="breakdown_card">
                <span>DNFs</span>
                <strong>{practiceDnfCount}</strong>
              </div>
              <div className="breakdown_card">
                <span>Total</span>
                <strong>{practiceSolves.length}</strong>
              </div>
            </div>
            <div className="chart_card">
              <div className="chart_card_header">
                <div className="chart_card_title">Practise Progress</div>
                <div className="section_meta">Last {practiceChartTimes.length || 0} solves</div>
              </div>
              {practiceChartPath ? (
                <div className="chart_canvas">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path className="chart_grid" d="M 0 20 L 100 20 M 0 50 L 100 50 M 0 80 L 100 80" />
                    <path className="chart_area" d={`${practiceChartPath} L 100 100 L 0 100 Z`} />
                    <path className="chart_line" d={practiceChartPath} />
                  </svg>
                </div>
              ) : (
                <div className="empty_chart_state">Practise a few attempts to draw your progress chart.</div>
              )}
            </div>
            <div className="chart_card">
              <div className="chart_card_header">
                <div>
                  <div className="chart_card_title">Practise Comm History</div>
                  <div className="study_stat_caption">Most frequent parsed cases from practise solves</div>
                </div>
                <div className="section_meta">{practiceRecentCommHistory.length ? `${practiceRecentCommHistory.length} tracked` : "No comms yet"}</div>
              </div>
              {practiceRecentCommHistory.length ? (
                <div className="stats_comm_list">
                  {practiceRecentCommHistory.map((entry) => (
                    <article key={`${entry.phase}-${entry.token}`} className="stats_comm_card">
                      <div className="stats_comm_identity">
                        <div className="stats_comm_title_row">
                          <div className="stats_comm_token">{entry.token}</div>
                          <div className={`stats_comm_phase stats_comm_phase_${entry.phase}`}>{entry.phase}</div>
                        </div>
                        <div className="stats_comm_meta">
                          Seen {entry.count} {entry.count === 1 ? "time" : "times"}
                          {entry.lastSeen ? ` | ${formatHistoryDate(entry.lastSeen)}` : ""}
                        </div>
                      </div>
                      <div className="stats_comm_metrics">
                        <div className="stats_comm_metric">
                          <span>Recog</span>
                          <strong>{this.formatInlineDuration(entry.avgRecog) || "--"}</strong>
                        </div>
                        <div className="stats_comm_metric">
                          <span>Exec</span>
                          <strong>{this.formatInlineDuration(entry.avgExec) || "--"}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty_state_card">
                  <div className="placeholder_eyebrow">Practise</div>
                  <div className="placeholder_text">Parsed comm history will appear here after practise solves.</div>
                </div>
              )}
            </div>
          </section>
        );
      } else if (practiceTab === "sessions") {
        mainView = (
          <section className="sessions_screen view_panel">
            <div className="section_header">
              <div>
                <div className="placeholder_title">Practise Session</div>
                <div className="placeholder_text">A separate practice-only block for edges and corners scrambles.</div>
              </div>
            </div>
            <div className="session_hero">
              <div className="session_hero_main">
                <div className="placeholder_eyebrow">Current Practise Block</div>
                <div className="session_hero_title">Edges + Corners</div>
                <div className="session_hero_text">
                  {practiceSolves.length
                    ? `${practiceSolves.length} practise solves logged locally.`
                    : "No practise solves logged yet."}
                </div>
              </div>
              <div className="session_hero_stats">
                <div>
                  <span>Best</span>
                  <strong>{practiceBestText}</strong>
                </div>
                <div>
                  <span>Success</span>
                  <strong>{practiceAccuracyText}</strong>
                </div>
              </div>
            </div>
            <div className="session_cards">
              <article className="session_card">
                <div>
                  <div className="session_card_title">Edges Only</div>
                  <div className="session_card_subtitle">Practise solves</div>
                </div>
                <div className="session_card_value">{practiceEdgesCount}</div>
              </article>
              <article className="session_card">
                <div>
                  <div className="session_card_title">Corners Only</div>
                  <div className="session_card_subtitle">Practise solves</div>
                </div>
                <div className="session_card_value">{practiceCornersCount}</div>
              </article>
              <article className="session_card">
                <div>
                  <div className="session_card_title">Latest Attempt</div>
                  <div className="session_card_subtitle">
                    {latestPracticeSolve ? formatDate(latestPracticeSolve.date) : "No solves yet"}
                  </div>
                </div>
                <div className="session_card_value">
                  {latestPracticeSolve ? this.convert_sec_to_format(latestPracticeSolve.time_solve) : "--"}
                </div>
              </article>
              <article className="session_card">
                <div>
                  <div className="session_card_title">Current Type</div>
                  <div className="session_card_subtitle">Scramble selector</div>
                </div>
                <div className="session_card_value">{this.getPracticeLabel()}</div>
              </article>
            </div>
          </section>
        );
      } else {
        mainView = (
          <section className="solve_screen practice_screen">
            <div className="practice_selector" aria-label="Practise scramble type">
              <button
                type="button"
                className={`practice_toggle ${this.state.practiceScrambleType === "edges" ? "practice_toggle_active" : ""}`}
                onClick={() => this.handlePracticeScrambleTypeChange("edges")}
              >
                Edges only
              </button>
              <button
                type="button"
                className={`practice_toggle ${this.state.practiceScrambleType === "corners" ? "practice_toggle_active" : ""}`}
                onClick={() => this.handlePracticeScrambleTypeChange("corners")}
              >
                Corners only
              </button>
            </div>

            <div className="timer_stage">
              <Timer
                scramble={this.getActiveScramble()}
                solve_status={this.state.solve_status}
                displayTimeMs={timerDisplayMs}
                onStart={(timer_start) => this.handle_onStart_timer(timer_start)}
                onStop={(timer_finish) => this.handle_onStop_timer(timer_finish)}
                minStopDelayMs={350}
                footer={
                  <div className="solve_metrics">
                    <div className="split_metric">
                      <div className="split_metric_label">Memo</div>
                      <div className="split_metric_value">{practiceMemoText}</div>
                    </div>
                    <div className="split_metric_divider"></div>
                    <div className="split_metric">
                      <div className="split_metric_label">Exec</div>
                      <div className="split_metric_value">{practiceExecText}</div>
                    </div>
                    <div className="split_metric_divider"></div>
                    <div className="split_metric">
                      <div className="split_metric_label">Type</div>
                      <div className="split_metric_value split_metric_value_small">{this.getPracticeLabel()}</div>
                    </div>
                    <div className="split_metric_divider"></div>
                    <div className="split_metric">
                      <div className="split_metric_label">Logged</div>
                      <div className="split_metric_value split_metric_value_small">{practiceCountLabel}</div>
                    </div>
                  </div>
                }
              />
            </div>

            <div className="last_solve_block">
              <div className="last_solve_heading">Last Practise Solve</div>
              {latestPracticeSolve ? (
                <button
                  type="button"
                  className="last_solve_panel last_solve_panel_button"
                  onClick={() => this.openSolveDetails(latestPracticeSolve)}
                  aria-label="Open last practise solve details"
                >
                  <div className="last_solve_metrics">
                    {lastPracticePanelData.metrics.map((metric) => (
                      <div key={metric.label} className="last_solve_metric">
                        <div className="split_metric_label">{metric.label}</div>
                        <div className="split_metric_value">{metric.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="last_solve_summary">
                    {lastPracticePanelData.lines.map((line) => (
                      <div key={line.label} className="last_solve_comm_line">
                        <span className="last_solve_comm_label">{line.label}:</span>
                        <span className="last_solve_comm_value">{line.value}</span>
                      </div>
                    ))}
                  </div>
                </button>
              ) : (
                <div className="last_solve_panel">
                  <div className="last_solve_summary">
                    Practise solves will appear here without changing normal history.
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      }
    } else {
      mainView = (
        <section className="solve_screen">
          <div className="timer_stage">
            <Timer
              scramble={this.getActiveScramble()}
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
            {latestSolve ? (
              <button
                type="button"
                className="last_solve_panel last_solve_panel_button"
                onClick={() => this.openSolveDetails(latestSolve)}
                aria-label="Open last solve details"
              >
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
              </button>
            ) : (
              <div className="last_solve_panel">
                <div className="last_solve_summary">
                  Your latest comms will appear here.
                </div>
              </div>
            )}
          </div>

        </section>
      );
    }

    return (
      <React.Fragment>
        <div className="application">
          <Helmet id="background_page"></Helmet>
        </div>
        <input
          ref={this.backupImportInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={this.importSolveBackup}
        />
        <div className="app_shell">
          <div className={`app_frame ${this.isLiveTimerView() ? "app_frame_solve" : ""}`}>
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
                <svg
                  className="icon_gear_svg"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3.2" />
                  <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1 0 2.8 2 2 0 0 1-2.8 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8 0 2 2 0 0 1 0-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 0-2.8 2 2 0 0 1 2.8 0l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 0 2 2 0 0 1 0 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.7Z" />
                </svg>
              </button>
            </header>

            {this.isLiveTimerView() ? (
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
                <div className="scramble_value">{this.getActiveScramble()}</div>
                <button
                  type="button"
                  className="scramble_refresh_button"
                  aria-label="New scramble"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.handle_scramble();
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6v5h-5" />
                    <path d="M4 18v-5h5" />
                    <path d="M19 11a7 7 0 0 0-12-4l-3 3" />
                    <path d="M5 13a7 7 0 0 0 12 4l3-3" />
                  </svg>
                </button>
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
                this.isLiveTimerView() ? "main_view_solve" : "main_view_page"
              }`}
            >
              {mainView}
            </main>

            {this.state.activeView === "alg-library" ? (
              <nav className="bottom_nav" aria-label="Alg Library">
                {algLibraryTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    className={`nav_item ${this.state.algLibraryTab === tab.value ? "nav_item_active" : ""}`}
                    onClick={() => this.setState({ algLibraryTab: tab.value, algLibraryEditing: false })}
                  >
                    <span className={`nav_icon nav_icon_library nav_icon_library_${tab.icon}`}></span>
                    <span className="nav_label nav_label_library">{tab.label}</span>
                  </button>
                ))}
              </nav>
            ) : this.state.activeView === "practice" ? (
              <nav className="bottom_nav" aria-label="Practise">
                <button
                  type="button"
                  className={`nav_item ${(this.state.practiceTab || "solve") === "solve" ? "nav_item_active" : ""}`}
                  onClick={() => this.setState({ practiceTab: "solve" }, this.handle_scramble)}
                >
                  <span className="nav_icon nav_icon_practice"></span>
                  <span className="nav_label">Practise</span>
                </button>
                <button
                  type="button"
                  className={`nav_item ${this.state.practiceTab === "history" ? "nav_item_active" : ""}`}
                  onClick={() => this.setState({ practiceTab: "history" })}
                >
                  <span className="nav_icon nav_icon_history"></span>
                  <span className="nav_label">History</span>
                </button>
                <button
                  type="button"
                  className={`nav_item ${this.state.practiceTab === "stats" ? "nav_item_active" : ""}`}
                  onClick={() => this.setState({ practiceTab: "stats" })}
                >
                  <span className="nav_icon nav_icon_stats"></span>
                  <span className="nav_label">Stats</span>
                </button>
                <button
                  type="button"
                  className={`nav_item ${this.state.practiceTab === "sessions" ? "nav_item_active" : ""}`}
                  onClick={() => this.setState({ practiceTab: "sessions" })}
                >
                  <span className="nav_icon nav_icon_sessions"></span>
                  <span className="nav_label">Sessions</span>
                </button>
              </nav>
            ) : (
              <nav className="bottom_nav" aria-label="Primary">
                <button
                  type="button"
                  className={`nav_item ${this.state.activeView === "solve" ? "nav_item_active" : ""}`}
                  onClick={() => this.setState({ activeView: "solve" }, this.handle_scramble)}
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
            )}
          </div>
        </div>

        {this.state.showMenu ? (
          <div
            className="solve_modal_backdrop solve_modal_backdrop_drawer"
            onClick={() => this.setState({ showMenu: false })}
          >
            <div className="menu_overlay menu_drawer" onClick={(event) => event.stopPropagation()}>
              <div className="solve_modal_header">
                <div>
                  <div className="section_label">Menu</div>
                  <div className="solve_modal_title">Menu</div>
                </div>
                <button
                  type="button"
                  className="solve_modal_close solve_modal_close_subtle"
                  aria-label="Close menu"
                  onClick={() => this.setState({ showMenu: false })}
                >
                  ×
                </button>
              </div>

              <div className="menu_list">
                <button
                  type="button"
                  className="menu_item"
                  onClick={() => this.setState({ showMenu: false, activeView: "solve" }, this.handle_scramble)}
                >
                  Solve
                </button>
                <button
                  type="button"
                  className="menu_item"
                  onClick={() => this.setState({ showMenu: false, activeView: "practice", practiceTab: "solve" }, this.handle_scramble)}
                >
                  Practise
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
                  onClick={() => this.setState({ showMenu: false, activeView: "alg-library" })}
                >
                  Alg Library
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
                  onClick={this.refreshAppWithoutClearingData}
                >
                  Update App
                </button>
                <button
                  type="button"
                  className="menu_item"
                  onClick={this.exportSolveBackup}
                >
                  Export Backup
                </button>
                <button
                  type="button"
                  className="menu_item"
                  onClick={this.triggerSolveBackupImport}
                >
                  Restore Backup
                </button>
                <button
                  type="button"
                  className="menu_item"
                  onClick={this.resetLocalAppData}
                >
                  Reset Local Data
                </button>
                <div className="menu_update_note">Last updated {APP_LAST_UPDATED_LABEL}</div>
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
              onClick={this.closeSolveDetailsModal}
            >
            <div className="solve_modal" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="solve_modal_close solve_modal_close_corner"
                aria-label="Close solve details"
                  onClick={this.closeSolveDetailsModal}
                >
                  x
                </button>
              {selectedSolveDetailsData ? (
                <React.Fragment>
                  {selectedSolveCommCardData ? (
                    <div
                      className={`solve_comm_overlay_card ${
                        selectedSolveCommCardData.status === "mismatch"
                          ? "solve_comm_overlay_card_warning"
                          : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="solve_comm_overlay_close"
                        aria-label="Close comm card"
                        onClick={this.closeSolveDetailsCommCard}
                      >
                        x
                      </button>
                      <div className="alg_library_card_top">
                        <strong>{selectedSolveCommCardData.label}</strong>
                        <span>
                          {selectedSolveCommCardData.pieceType
                            ? `${selectedSolveCommCardData.pieceType.charAt(0).toUpperCase()}${selectedSolveCommCardData.pieceType.slice(1)}`
                            : ""}
                        </span>
                      </div>
                      {this.state.solveCommEditorDraft && selectedSolveCommEntry ? (
                        <React.Fragment>
                          <div className="solve_comm_editor_grid">
                            <div className="solve_comm_editor_pair">
                              <input
                                type="text"
                                className="settings_input alg_library_inline_input"
                                placeholder="Category"
                                defaultValue={this.state.solveCommEditorDraft.category || ""}
                                onChange={(event) => this.updateSolveCommEditorDraftField("category", event.target.value)}
                              />
                              <input
                                type="text"
                                className="settings_input alg_library_inline_input"
                                placeholder="Memo"
                                defaultValue={this.state.solveCommEditorDraft.memoWord || ""}
                                onChange={(event) => this.updateSolveCommEditorDraftField("memoWord", event.target.value)}
                              />
                            </div>
                            <textarea
                              className="settings_textarea alg_library_inline_textarea"
                              placeholder="Description"
                              defaultValue={this.state.solveCommEditorDraft.description || ""}
                              onChange={(event) => this.updateSolveCommEditorDraftField("description", event.target.value)}
                            />
                            <textarea
                              className="settings_textarea alg_library_inline_textarea"
                              placeholder="Alg"
                              defaultValue={this.state.solveCommEditorDraft.alg || ""}
                              onChange={(event) => this.updateSolveCommEditorDraftField("alg", event.target.value)}
                            />
                            <textarea
                              className="settings_textarea alg_library_inline_textarea solve_comm_editor_notes"
                              placeholder="Notes"
                              defaultValue={this.state.solveCommEditorDraft.notes || ""}
                              onChange={(event) => this.updateSolveCommEditorDraftField("notes", event.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            className="solve_comm_overlay_edit solve_comm_overlay_save"
                            aria-label="Save comm changes"
                            onClick={this.saveSolveDetailsCommEditor}
                            disabled={this.state.solveCommEditorSaving}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m5 13 4 4L19 7" />
                            </svg>
                          </button>
                        </React.Fragment>
                      ) : (
                        <React.Fragment>
                          <div className="alg_library_card_meta">
                            <span>{selectedSolveCommCardData.category}</span>
                            <span>{selectedSolveCommCardData.memoWord}</span>
                          </div>
                          <div className="alg_library_card_desc">
                            <span>{selectedSolveCommCardData.description}</span>
                            <span>
                              {selectedSolveCommCardData.status === "mismatch"
                                ? "Different from library"
                                : selectedSolveCommCardData.status === "match"
                                  ? "Matches library"
                                  : selectedSolveCommCardData.status === "missing"
                                    ? "Missing from library"
                                    : selectedSolveCommCardData.timing}
                            </span>
                          </div>
                          <div className="solve_comm_overlay_alg_block">
                            <div className="solve_comm_overlay_alg_row">
                              <span>Library</span>
                              <strong>{selectedSolveCommCardData.preferredAlg}</strong>
                            </div>
                            <div className="solve_comm_overlay_alg_row">
                              <span>Used</span>
                              <strong>{selectedSolveCommCardData.usedAlg}</strong>
                            </div>
                          </div>
                          {selectedSolveCommEntry ? (
                            <button
                              type="button"
                              className="solve_comm_overlay_edit"
                              aria-label="Edit comm"
                              onClick={() => this.openSolveDetailsCommEditor(selectedSolveCommEntry)}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>
                          ) : null}
                        </React.Fragment>
                      )}
                    </div>
                  ) : null}
                  <div className="solve_details_header">
                    <div className="solve_details_header_left">
                      <div className="solve_modal_title">{selectedSolveDetailsData.title}</div>
                      <div className="solve_details_split_line">{selectedSolveDetailsData.memoExecLabel}</div>
                    </div>
                    <div className="solve_details_header_right">
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
                      <div className="solve_details_date">{selectedSolveDetailsData.date}</div>
                    </div>
                  </div>
                  <div className="solve_details_metrics">
                    {selectedSolveDetailsData.metrics.map((metric) => (
                      <div key={metric.label} className="solve_details_metric">
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="solve_reconstruction_box">
                    {selectedSolveDetailsData.edgeRows.length ? (
                      <React.Fragment>
                        <div className="reconstruction_phase_header">
                          <div className="reconstruction_phase_title">Edges</div>
                          <div className="reconstruction_timing_header">
                            <span>Recog</span>
                            <span>Exec</span>
                          </div>
                        </div>
                        {selectedSolveDetailsData.edgeRows.map((comm, index) => (
                          (() => {
                            const displayLabel = this.formatSolveDetailsCommLabel(comm);
                            return (
                          <div
                            key={`edge-${comm.comm_index || index}`}
                            className={`reconstruction_row ${comm.phase === "unknown" ? "reconstruction_row_unknown" : ""}`}
                          >
                            <div className="reconstruction_identity">
                              {comm.label ? (
                                <button
                                  type="button"
                                  className={`reconstruction_comm_button reconstruction_comm_name ${
                                    this.state.solveDetailsCommStatusByKey[this.getSolveDetailsCommRowKey(comm)] === "mismatch"
                                      ? "reconstruction_comm_button_warning"
                                      : ""
                                  }`}
                                  onClick={() => this.openSolveDetailsCommCard(comm)}
                                >
                                  <span className="reconstruction_comm_label">
                                    <span>{displayLabel.primary}</span>
                                    {displayLabel.secondary ? (
                                      <span className="reconstruction_comm_label_sub">{displayLabel.secondary}</span>
                                    ) : null}
                                  </span>
                                </button>
                              ) : (
                                <span className="reconstruction_comm_label">--</span>
                              )}
                              <span className="reconstruction_row_main">
                                {this.formatReconstructionAlg(comm) || "--"}
                              </span>
                            </div>
                            <div className="reconstruction_timing_grid">
                              <div className="reconstruction_timing_cell">
                                <strong className="reconstruction_recog_time">
                                  {this.formatCommTimingValue(comm.recogDuration)}
                                </strong>
                              </div>
                              <div className="reconstruction_timing_cell">
                                <strong>{this.formatCommTimingValue(comm.execDuration)}</strong>
                              </div>
                            </div>
                          </div>
                            );
                          })()
                        ))}
                      </React.Fragment>
                    ) : null}
                    {selectedSolveDetailsData.cornerRows.length ? (
                      <React.Fragment>
                        <div className="reconstruction_phase_header">
                          <div className="reconstruction_phase_title">
                            Corners
                            {Number.isFinite(selectedSolveDetailsData.transitionSeconds) ? (
                              <span className="reconstruction_phase_detail">
                                {" "}
                                ({this.formatInlineDuration(selectedSolveDetailsData.transitionSeconds)} transition)
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {selectedSolveDetailsData.cornerRows.map((comm, index) => (
                          (() => {
                            const displayLabel = this.formatSolveDetailsCommLabel(comm);
                            return (
                          <div
                            key={`corner-${comm.comm_index || index}`}
                            className={`reconstruction_row ${comm.phase === "unknown" ? "reconstruction_row_unknown" : ""}`}
                          >
                            <div className="reconstruction_identity">
                              {comm.label ? (
                                <button
                                  type="button"
                                  className={`reconstruction_comm_button reconstruction_comm_name ${
                                    this.state.solveDetailsCommStatusByKey[this.getSolveDetailsCommRowKey(comm)] === "mismatch"
                                      ? "reconstruction_comm_button_warning"
                                      : ""
                                  }`}
                                  onClick={() => this.openSolveDetailsCommCard(comm)}
                                >
                                  <span className="reconstruction_comm_label">
                                    <span>{displayLabel.primary}</span>
                                    {displayLabel.secondary ? (
                                      <span className="reconstruction_comm_label_sub">{displayLabel.secondary}</span>
                                    ) : null}
                                  </span>
                                </button>
                              ) : (
                                <span className="reconstruction_comm_label">--</span>
                              )}
                              <span className="reconstruction_row_main">
                                {this.formatReconstructionAlg(comm) || "--"}
                              </span>
                            </div>
                            <div className="reconstruction_timing_grid">
                              <div className="reconstruction_timing_cell">
                                <strong className="reconstruction_recog_time">
                                  {this.formatCommTimingValue(comm.recogDuration)}
                                </strong>
                              </div>
                              <div className="reconstruction_timing_cell">
                                <strong>{this.formatCommTimingValue(comm.execDuration)}</strong>
                              </div>
                            </div>
                          </div>
                            );
                          })()
                        ))}
                      </React.Fragment>
                    ) : null}
                    {!selectedSolveDetailsData.edgeRows.length &&
                    !selectedSolveDetailsData.cornerRows.length ? (
                      <div className="empty_chart_state">No comm reconstruction available yet.</div>
                    ) : null}
                  </div>
                  <div className="solve_details_scramble_box">
                    <div className="reconstruction_phase_title">Scramble</div>
                    <div className="solve_details_scramble_text">
                      {selectedSolveDetailsData.scramble || "--"}
                    </div>

                  </div>
                  {selectedSolveMemoData ? (
                    <div className="solve_details_memo_box">
                      <div className="reconstruction_phase_title">Memo</div>
                      <div className="solve_details_memo_line">
                        <span>Corners:</span>
                        <strong>{selectedSolveMemoData.corners}</strong>
                      </div>
                      <div className="solve_details_memo_line">
                        <span>Edges:</span>
                        <strong>{selectedSolveMemoData.edges}</strong>
                      </div>
                    </div>
                  ) : null}
                  {this.state.solveRecommendationLoading || this.state.solveRecommendation || this.state.solveRecommendationError ? (
                    <div className="solve_recommendation_box">
                      <div className="reconstruction_phase_title">Recommended Solve</div>
                      {this.state.solveRecommendationLoading ? (
                        <div className="solve_recommendation_status">Building recommendation...</div>
                      ) : this.state.solveRecommendationError ? (
                        <div className="solve_recommendation_status solve_recommendation_error">
                          {this.state.solveRecommendationError}
                        </div>
                      ) : this.state.solveRecommendation ? (
                        (() => {
                          const recommendation = this.state.solveRecommendation;
                          const formatItems = (items) => Array.isArray(items) && items.length ? items.join(", ") : "--";
                          return (
                            <div className="solve_recommendation_grid">
                              <div className="solve_recommendation_line">
                                <span>Edges</span>
                                <strong>{formatItems(recommendation.edgePairs)}</strong>
                              </div>
                              <div className="solve_recommendation_line">
                                <span>Flips</span>
                                <strong>{formatItems(recommendation.flips)}</strong>
                              </div>
                              <div className="solve_recommendation_line">
                                <span>Corners</span>
                                <strong>{formatItems(recommendation.cornerPairs)}</strong>
                              </div>
                              <div className="solve_recommendation_line">
                                <span>Twists</span>
                                <strong>{formatItems(recommendation.twists)}</strong>
                              </div>
                              <div className="solve_recommendation_line">
                                <span>Parity</span>
                                <strong>{recommendation.parity ? recommendation.parity.label : "--"}</strong>
                              </div>
                              {recommendation.notes.map((note, index) => (
                                <div key={`recommendation-note-${index}`} className="solve_recommendation_note">
                                  {note}
                                </div>
                              ))}
                            </div>
                          );
                        })()
                      ) : null}
                    </div>
                  ) : null}
                  <div className="solve_details_footer">
                    <div className="solve_details_dnf_controls">
                      <select
                        className="settings_input solve_details_select"
                        value={this.state.solveDetailsDnfCategory}
                        onChange={(event) => this.handleSolveDetailsDnfCategoryChange(event.target.value)}
                      >
                        <option value="">DNF reason</option>
                        <option value="Forgot Memo">Forgot Memo</option>
                        <option value="Wrong Exec">Wrong Exec</option>
                      </select>
                      <select
                        className="settings_input solve_details_select"
                        value={this.state.solveDetailsDnfStage}
                        onChange={(event) => this.handleSolveDetailsDnfStageChange(event.target.value)}
                      >
                        <option value="">Stage</option>
                        <option value="Edge">Edge</option>
                        <option value="Corner">Corner</option>
                        <option value="Parity">Parity</option>
                        <option value="Flip">Flip</option>
                        <option value="Twist">Twist</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="study_library_button solve_details_action solve_details_action_danger"
                      onClick={this.deleteSelectedSolve}
                    >
                      Delete Solve
                    </button>
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
