// based on https://codesandbox.io/s/31rvox7ojm Patryk Mazurkiewicz patmaz
import React from "react";

class Timer extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      start_time: null,
      update_ref: null,
      ready_state: "",
      running: false,
      currentTimeMs: 0,
      currentTimeSec: 0,
      currentTimeMin: 0,
      pressKeyTimeCount: null,
    };
    this.holdTimeout = null;
  }

  componentDidMount() {
    this.syncDisplayTimeFromProps(this.props.displayTimeMs);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.displayTimeMs !== this.props.displayTimeMs && !this.state.running) {
      this.syncDisplayTimeFromProps(this.props.displayTimeMs);
    }
  }

  formatTime = (val, ...rest) => {
    let value = val.toString();
    if (value.length < 2) {
      value = "0" + value;
    }

    if (rest[0] === "ms" && value.length === 3) {
      value = value.slice(0, 2);
    }
    return value;
  };

  start = () => {
    if (!this.state.running) {
      this.setState({ start_time: Date.now() });
      this.setState({ update_ref: Date.now() });
      this.setState({ running: true });
      this.watch = setInterval(() => this.pace(), 10);
    }
  };

  stop = () => {
    this.setState({ running: false });
    clearInterval(this.watch);
    this.pace();
  };

  canStop = () => {
    const minStopDelayMs = this.props.minStopDelayMs || 350;
    if (!this.state.start_time) {
      return false;
    }
    return Date.now() - this.state.start_time >= minStopDelayMs;
  };

  pace = () => {
    const diff = Date.now() - this.state.start_time;
    this.setState({ currentTimeMs: diff % 1000 });
    this.setState({ update_ref: Date.now() });
    this.setState({ currentTimeSec: Math.floor(diff / 1000) % 60 });
    this.setState({ currentTimeMin: Math.floor(diff / 1000 / 60) });
  };

  reset = () => {
    this.setState({
      currentTimeMs: 0,
      currentTimeSec: 0,
      currentTimeMin: 0,
    });
  };

  syncDisplayTimeFromProps = (timeMs) => {
    const safeTimeMs = Number.isFinite(timeMs) && timeMs > 0 ? Math.floor(timeMs) : 0;
    this.setState({
      currentTimeMs: safeTimeMs % 1000,
      currentTimeSec: Math.floor(safeTimeMs / 1000) % 60,
      currentTimeMin: Math.floor(safeTimeMs / 1000 / 60),
    });
  };

  componentWillUnmount() {
    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
      this.holdTimeout = null;
    }
    clearInterval(this.watch);
  }

  startHold = () => {
    if (this.state.running) {
      return;
    }

    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
    }

    this.setState({ pressKeyTimeCount: Date.now(), ready_state: "text-info" });
    this.holdTimeout = setTimeout(() => {
      this.setState({ ready_state: "text-success" });
      this.holdTimeout = null;
    }, 180);
  };

  cancelHold = () => {
    if (this.holdTimeout) {
      clearTimeout(this.holdTimeout);
      this.holdTimeout = null;
    }
    this.setState({ ready_state: "", pressKeyTimeCount: null });
  };

  handle_touch_press_up = (event) => {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (this.state.running) {
      return;
    }

    const canStart = this.state.ready_state === "text-success";
    this.cancelHold();
    if (canStart) {
      this.reset();
      this.start();
      this.props.onStart(Date.now());
    }
  };

  handle_touch_press_down = (event) => {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (this.state.running) {
      if (!this.canStop()) {
        return;
      }
      this.cancelHold();
      this.stop();
      this.props.onStop(this.state.update_ref);
      return;
    }

    this.startHold();
  };
  handle_key_press_up = (event) => {
    if (event.key !== " ") {
      return;
    }

    if (this.state.running) {
      return;
    }

    const canStart = this.state.ready_state === "text-success";
    this.cancelHold();
    if (canStart) {
      this.reset();
      this.start();
      this.props.onStart(Date.now());
    }
  };
  handle_key_press_down = (event) => {
    if (event.key !== " ") {
      return;
    }

    event.preventDefault();

    if (this.state.running) {
      if (!this.canStop()) {
        return;
      }
      this.cancelHold();
      this.stop();
      this.props.onStop(this.state.update_ref);
      return;
    }

    if (this.state.pressKeyTimeCount == null) {
      this.startHold();
    }
  };

  handle_mouse_up = (event) => {
    if (event.button !== 0 || this.state.running) {
      return;
    }

    const canStart = this.state.ready_state === "text-success";
    this.cancelHold();
    if (canStart) {
      this.reset();
      this.start();
      this.props.onStart(Date.now());
    }
  };

  handle_mouse_down = (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    if (this.state.running) {
      if (!this.canStop()) {
        return;
      }
      this.cancelHold();
      this.stop();
      this.props.onStop(this.state.update_ref);
      return;
    }

    this.startHold();
  };

  // componentDidUpdate() {
  // document.getElementById('timer_element_2').focus();
  // }
  render() {
    return (
      <div
        id="timer_element_2"
        className="timer_surface"
        tabIndex="0"
        onKeyUp={this.handle_key_press_up}
        onKeyDown={this.handle_key_press_down}
        onTouchStart={this.handle_touch_press_down}
        onTouchEnd={this.handle_touch_press_up}
        onMouseDown={this.handle_mouse_down}
        onMouseUp={this.handle_mouse_up}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className={`timer_status_wrap ${this.state.ready_state}`}>
          <div className="solve_status">
            {this.state.running
              ? "Tap to stop"
              : this.state.ready_state === "text-success"
              ? "Release to start"
              : this.state.ready_state === "text-info"
              ? "Hold..."
              : this.props.solve_status}
          </div>
        </div>
        <div className="timer_on_screen">
          {this.formatTime(this.state.currentTimeMin)}:
          {this.formatTime(this.state.currentTimeSec)}.
          {this.formatTime(this.state.currentTimeMs, "ms")}
        </div>
        {this.props.footer ? <div className="timer_footer">{this.props.footer}</div> : null}
      </div>
    );
  }
}

export default Timer;
