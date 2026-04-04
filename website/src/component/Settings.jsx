import React from "react";
import "bootstrap/dist/css/bootstrap.css";
import Tab from "react-bootstrap/Tab";
import Tabs from "react-bootstrap/Tabs";
import SettingGeneral from "./SettingsGeneral";
import SettingLetterScheme from "./SettingLetterScheme";
import Collapse from "react-bootstrap/Collapse";

class Setting extends React.Component {
  constructor(props) {
    super(props);
    this.state = this.constructor_func(props);
  }

  constructor_func = (props) => {
    let state =
      localStorage.getItem("setting") === null
        ? {
            open: false,
            setting_save_statue: "",
            import_setting: {},
            setting_save: {},
            parse_with_letter_pair: true,
            gen_with_move_count: true,
            edge_buffer: "UF",
            corner_buffer: "UFR",
            cube_oreintation : "yellow-green",
            scramble_type : "3x3",
            GEN_PARSED_TO_CUBEDB: true,
            letter_pair_dict: this.get_letter_pair_dict(),
          }
        : {
            open: false,
            setting_save_statue: "",
            import_setting: {},
            setting_save: {},
            parse_with_letter_pair: props.cur_setting["PARSE_TO_LETTER_PAIR"],
            gen_with_move_count: props.cur_setting["GEN_WITH_MOVE_COUNT"],
            edge_buffer: props.cur_setting["EDGES_BUFFER"],
            corner_buffer: props.cur_setting["CORNER_BUFFER"],
            cube_oreintation : props.cur_setting["CUBE_OREINTATION"],
            scramble_type : props.cur_setting["SCRAMBLE_TYPE"],
            GEN_PARSED_TO_CUBEDB: true,
            letter_pair_dict: JSON.parse(
              props.cur_setting["LETTER_PAIRS_DICT"]
            ),
          };
    return state;
  };
  componentDidMount() {
    if (localStorage.getItem("setting") !== null) {
      JSON.parse(localStorage.getItem("setting"));
      this.props.export_setting(JSON.parse(localStorage.getItem("setting")));
    } else {
      this.handle_save_setting();
    }
  }
  updateSettingState = (nextState) => {
    this.setState(nextState, this.handle_save_setting);
  };
  handle_move_count_change = (event) => {
    this.updateSettingState({ gen_with_move_count: event.target.checked });
  };
  handle_apply_letter_pairs_change = (event) => {
    this.updateSettingState({ parse_with_letter_pair: event.target.checked });
  };
  handle_corner_buffer = (event) => {
    this.updateSettingState({ corner_buffer: event.target.value });
  };
  handle_edge_buffer = (event) => {
    this.updateSettingState({ edge_buffer: event.target.value });
  };
  handle_cube_oreintation = (event) => {
    this.updateSettingState({ cube_oreintation: event.target.value });
  };
  handle_scramble_type = (event) => {
    this.updateSettingState({ scramble_type: event.target.value });
  };


  handle_letter_pair_dict = (event) => {
    const letter_pair_dict_new = { ...this.state.letter_pair_dict };
    letter_pair_dict_new[event.target.id] = event.target.value;
    this.updateSettingState({ letter_pair_dict: letter_pair_dict_new });
  };

  handle_save_setting = () => {
    const setting = {
      EDGES_BUFFER: this.state.edge_buffer,
      CORNER_BUFFER: this.state.corner_buffer,
      CUBE_OREINTATION : this.state.cube_oreintation,
      SCRAMBLE_TYPE : this.state.scramble_type,
      PARSE_TO_LETTER_PAIR: this.state.parse_with_letter_pair,
      GEN_WITH_MOVE_COUNT: this.state.gen_with_move_count,
      GEN_PARSED_TO_CUBEDB: this.state.GEN_PARSED_TO_CUBEDB,
      ID: this.props.id,
      LETTER_PAIRS_DICT: JSON.stringify(this.state.letter_pair_dict),
    };
    this.setState({ setting_save: setting });
    this.props.export_setting(setting);
    this.setState({ setting_save_statue: "" });
  };
  handle_import_onClick = (event) => {
    let new_settings = JSON.parse(this.state.import_setting);
    this.setState({ setting_save: JSON.parse(this.state.import_setting) });
    this.props.export_setting(new_settings);
  };
  handle_import_onChange = (event) => {
    let setting = event.target.value;
    this.setState({ import_setting: setting });
  };
  handle_cubedb_txt = (event) => {
    this.setState({ GEN_PARSED_TO_CUBEDB: event.target.checked });
    this.setState({ setting_save_statue: " - Changes unsaved" });
  };
  handle_reset_setting = () => {
    if (window.confirm("Are you sure you want to reset settings?")) {
      console.log("here");
      localStorage.removeItem("setting");
      const setting = {
        EDGES_BUFFER: "UF",
        CORNER_BUFFER: "UFR",
        CUBE_OREINTATION: "yellow-green",
        PARSE_TO_LETTER_PAIR: true,
        GEN_WITH_MOVE_COUNT: true,
        GEN_PARSED_TO_CUBEDB: true,
        ID: this.props.id,
        LETTER_PAIRS_DICT: JSON.stringify(this.get_letter_pair_dict()),
      };
      this.setState({ setting_save: setting });
      this.props.export_setting(setting);
      this.setState({ setting_save_statue: "" });
      window.location.reload();
    }
  };
  get_letter_pair_dict = () => {
    let letter_pair_dict = {
      UBL: "A",
      UBR: "B",
      UFR: "C",
      UFL: "D",
      LBU: "E",
      LFU: "F",
      LFD: "G",
      LDB: "H",
      FUL: "I",
      FUR: "J",
      FRD: "K",
      FDL: "L",
      RFU: "M",
      RBU: "N",
      RBD: "O",
      RFD: "P",
      BUR: "Q",
      BUL: "R",
      BLD: "S",
      BRD: "T",
      DFL: "U",
      DFR: "V",
      DBR: "W",
      DBL: "X",
      UB: "A",
      UR: "B",
      UF: "C",
      UL: "D",
      LU: "E",
      LF: "F",
      LD: "G",
      LB: "H",
      FU: "I",
      FR: "J",
      FD: "K",
      FL: "L",
      RU: "M",
      RB: "N",
      RD: "O",
      RF: "P",
      BU: "Q",
      BL: "R",
      BD: "S",
      BR: "T",
      DF: "U",
      DR: "V",
      DB: "W",
      DL: "X",
    };
    return letter_pair_dict;
  };
  render_embedded_settings = () => {
    return (
      <div className="settings_screen">
        <div className="settings_section">
          <div className="settings_section_label">Connectivity</div>
          <div className="settings_card settings_card_connection">
            <div className="settings_connection_icon">B</div>
            <div className="settings_connection_text">
              <div className="settings_card_title">GAN i3 Smart Cube</div>
              <div className="settings_card_subtitle">
                {this.props.cur_setting["SMART_CUBE"] ? "Connected" : "Ready to connect"}
              </div>
            </div>
            <div className="settings_action_row">
              <button
                type="button"
                className="settings_inline_action"
                onClick={
                  this.props.cur_setting["SMART_CUBE"]
                    ? this.props.onDisconnectCube
                    : this.props.onManageCube
                }
              >
                {this.props.cur_setting["SMART_CUBE"] ? "Disconnect" : "Connect"}
              </button>
              <button
                type="button"
                className="settings_inline_action settings_inline_action_secondary"
                onClick={this.props.onResetCube}
              >
                Reset Cube
              </button>
            </div>
          </div>
        </div>

        <div className="settings_section">
          <div className="settings_section_label">Buffers</div>
          <div className="settings_buffer_grid">
            <label className="settings_compact_card">
              <span className="settings_compact_label">Corner</span>
              <select
                className="settings_compact_select"
                value={this.state.corner_buffer}
                onChange={this.handle_corner_buffer}
              >
                <option value="UFR">UFR</option>
                <option value="UBL">UBL</option>
                <option value="UBR">UBR</option>
                <option value="UFL">UFL</option>
                <option value="LBU">LBU</option>
                <option value="LFU">LFU</option>
                <option value="LFD">LFD</option>
                <option value="LDB">LDB</option>
                <option value="FUL">FUL</option>
                <option value="FUR">FUR</option>
                <option value="FRD">FRD</option>
                <option value="FDL">FDL</option>
                <option value="RFU">RFU</option>
                <option value="RBU">RBU</option>
                <option value="RBD">RBD</option>
                <option value="RFD">RFD</option>
                <option value="BUR">BUR</option>
                <option value="BUL">BUL</option>
                <option value="BLD">BLD</option>
                <option value="BRD">BRD</option>
                <option value="DFL">DFL</option>
                <option value="DFR">DFR</option>
                <option value="DBR">DBR</option>
                <option value="DBL">DBL</option>
              </select>
            </label>
            <label className="settings_compact_card">
              <span className="settings_compact_label">Edge</span>
              <select
                className="settings_compact_select"
                value={this.state.edge_buffer}
                onChange={this.handle_edge_buffer}
              >
                <option value="UF">UF</option>
                <option value="UB">UB</option>
                <option value="UR">UR</option>
                <option value="UL">UL</option>
                <option value="LU">LU</option>
                <option value="LF">LF</option>
                <option value="LD">LD</option>
                <option value="LB">LB</option>
                <option value="FU">FU</option>
                <option value="FR">FR</option>
                <option value="FD">FD</option>
                <option value="FL">FL</option>
                <option value="RU">RU</option>
                <option value="RB">RB</option>
                <option value="RD">RD</option>
                <option value="RF">RF</option>
                <option value="BU">BU</option>
                <option value="BL">BL</option>
                <option value="BD">BD</option>
                <option value="BR">BR</option>
                <option value="DF">DF</option>
                <option value="DR">DR</option>
                <option value="DB">DB</option>
                <option value="DL">DL</option>
              </select>
            </label>
          </div>
        </div>

        <div className="settings_section">
          <div className="settings_section_label">Global Orientation</div>
          <label className="settings_list_card settings_orientation_card">
            <span className="settings_list_title">Top / Front</span>
            <select
              className="settings_inline_select"
              value={this.state.cube_oreintation}
              onChange={this.handle_cube_oreintation}
            >
              <option value="white-green">White-Green</option>
              <option value="white-blue">White-Blue</option>
              <option value="white-orange">White-Orange</option>
              <option value="white-red">White-Red</option>
              <option value="green-white">Green-White</option>
              <option value="green-yellow">Green-Yellow</option>
              <option value="green-orange">Green-Orange</option>
              <option value="green-red">Green-Red</option>
              <option value="yellow-green">Yellow-Green</option>
              <option value="yellow-blue">Yellow-Blue</option>
              <option value="yellow-orange">Yellow-Orange</option>
              <option value="yellow-red">Yellow-Red</option>
              <option value="blue-white">Blue-White</option>
              <option value="blue-yellow">Blue-Yellow</option>
              <option value="blue-orange">Blue-Orange</option>
              <option value="blue-red">Blue-Red</option>
              <option value="orange-white">Orange-White</option>
              <option value="orange-green">Orange-Green</option>
              <option value="orange-yellow">Orange-Yellow</option>
              <option value="orange-blue">Orange-Blue</option>
              <option value="red-white">Red-White</option>
              <option value="red-green">Red-Green</option>
              <option value="red-yellow">Red-Yellow</option>
              <option value="red-blue">Red-Blue</option>
            </select>
          </label>
        </div>
      </div>
    );
  };
  render() {
    const showEmbedded = this.props.embedded === true;
    const settingsBody = (
      <div style={{ fontFamily: "Rubik" }}>
        <div className="setting_collapse_menu">
          <Tabs defaultActiveKey="first">
            <Tab eventKey="first" title="General">
              <SettingGeneral
                handle_reset_setting={this.handle_reset_setting}
                handle_save_setting={this.handle_save_setting}
                id={this.props.id}
                onChange_cubedb={this.handle_cubedb_txt}
                parse_with_letter_pair={this.state.parse_with_letter_pair}
                onChange_move_count={this.handle_move_count_change}
                onChange_apply_letter_pair={
                  this.handle_apply_letter_pairs_change
                }
                onChange_corner_buffer={this.handle_corner_buffer}
                onChange_edge_buffer={this.handle_edge_buffer}
                onChange_cube_oreintation={this.handle_cube_oreintation}
                onChange_scramble_type={this.handle_scramble_type}
                edge_buffer={this.state.edge_buffer}
                corner_buffer={this.state.corner_buffer}
                cube_oreintation={this.state.corner_buffer}
                scramble_type={this.props.scramble_type}
                cur_setting={this.props.cur_setting}
              />
            </Tab>
            <Tab eventKey="second" title="letter scheme">
              <SettingLetterScheme
                letter_pair_dict={this.state.letter_pair_dict}
                onChange_letter_pair_dict={this.handle_letter_pair_dict}
              />
            </Tab>
          </Tabs>
        </div>
      </div>
    );

    if (showEmbedded) {
      return <div className="settings_embedded_shell">{this.render_embedded_settings()}</div>;
    }

    return (
      <React.Fragment>
        <button
          className="setting_btn btn btn-primary m-1"
          onClick={() => this.setState({ open: !this.state.open })}
          aria-controls="example-collapse-text"
          aria-expanded={this.state.open}
        >
          Settings
          <div className="primary">{this.state.setting_save_statue}</div>
        </button>
        <div className="text-black">
          <Collapse in={this.state.open}>
            {settingsBody}
          </Collapse>{" "}
        </div>
      </React.Fragment>
    );
  }
}

export default Setting;
