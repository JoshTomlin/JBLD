# -*- coding: utf-8 -*-
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import os
import json
import traceback
from BLD_Parser import parse_solve
from DB_LOGS import add_log_of_request  # Update this import statement
from solve_store import create_session, fetch_sessions_with_solves, fetch_solve_detail, save_parsed_solve

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

def init_env_var(dict_params):
    os.environ["SMART_CUBE"] = "True" if dict_params["SMART_CUBE"] == True else "False"
    os.environ["GEN_PARSED_TO_CUBEDB"] = "True" if dict_params["GEN_PARSED_TO_CUBEDB"] == True else "False"
    os.environ["GEN_PARSED_TO_TXT"] = "True" if dict_params["GEN_PARSED_TO_TXT"] == True else "False"
    os.environ["NAME_OF_SOLVE"] = dict_params["NAME_OF_SOLVE"]
    os.environ["TIME_SOLVE"] = dict_params["TIME_SOLVE"]
    os.environ["COMMS_UNPARSED"] = "True" if dict_params["COMMS_UNPARSED"]  == True else "False"
    os.environ["GEN_WITH_MOVE_COUNT"] = "True" if dict_params["GEN_WITH_MOVE_COUNT"] == True else "False"
    os.environ["DIFF_BETWEEN_ALGS"] = dict_params["DIFF_BETWEEN_ALGS"]
    os.environ["PARSE_TO_LETTER_PAIR"] = "True" if dict_params["PARSE_TO_LETTER_PAIR"] == True else "False"
    os.environ["EDGES_BUFFER"] = dict_params["EDGES_BUFFER"]
    os.environ["CORNER_BUFFER"] = dict_params["CORNER_BUFFER"]
    os.environ["CUBE_OREINTATION"] = dict_params["CUBE_OREINTATION"]
    os.environ["LETTER_PAIRS_DICT"] = dict_params["LETTER_PAIRS_DICT"]
    os.environ["SCRAMBLE"] = dict_params["SCRAMBLE"]
    os.environ["SOLVE"] = dict_params["SOLVE"]
    os.environ["MEMO"] = dict_params["MEMO"]
    os.environ["SOLVE_TIME_MOVES"] = dict_params["SOLVE_TIME_MOVES"]
    os.environ["DATE_SOLVE"] = dict_params["DATE_SOLVE"]
    os.environ["SCRAMBLE_TYPE"] = dict_params["SCRAMBLE_TYPE"]
    os.environ["ID"] = dict_params["ID"]


def parse(dict_params):
    init_env_var(dict_params)
    cube = parse_solve(dict_params["SCRAMBLE"], dict_params["SOLVE"])
    return cube.parsed_solve, cube


@app.route('/api/sessions', methods=['GET'])
def handle_get_sessions():
    user_id = request.args.get('user_id')
    if not user_id:
        return make_response({"error": "user_id query parameter is required"}, 400)

    try:
        sessions = fetch_sessions_with_solves(user_id)
        return jsonify({"sessions": sessions})
    except Exception:
        print(traceback.format_exc())
        return make_response({"error": "Failed to load sessions", "details": traceback.format_exc()}, 500)


@app.route('/api/sessions', methods=['POST'])
def handle_create_session():
    payload = request.get_json(silent=True) or {}
    user_id = payload.get("user_id")
    name = payload.get("name")

    if not user_id or not name:
        return make_response({"error": "user_id and name are required"}, 400)

    try:
        session = create_session(
            user_id=user_id,
            name=name,
            puzzle_type=payload.get("puzzle_type") or "3x3 BLD",
            scramble_type=payload.get("scramble_type") or "3x3",
        )
        return jsonify({"session": session})
    except Exception:
        print(traceback.format_exc())
        return make_response({"error": "Failed to create session", "details": traceback.format_exc()}, 500)


@app.route('/api/solves/<int:solve_id>', methods=['GET'])
def handle_get_solve_detail(solve_id):
    user_id = request.args.get('user_id')
    if not user_id:
        return make_response({"error": "user_id query parameter is required"}, 400)

    try:
        solve = fetch_solve_detail(user_id, solve_id)
        if not solve:
            return make_response({"error": "Solve not found"}, 404)
        return jsonify({"solve": solve})
    except Exception:
        print(traceback.format_exc())
        return make_response({"error": "Failed to load solve", "details": traceback.format_exc()}, 500)

@app.route('/parse', methods=['POST'])
def handle_parse_request():
    address = request.headers.get('X-Real-IP') or request.remote_addr
    post_data = request.get_json(silent=True)
    try:
        if not post_data:
            return make_response("Invalid JSON payload", 400)

        parsed_solve, cube = parse(post_data)
        response_payload = dict(parsed_solve)
         
        # Logging must not break parse responses.
        try:
            add_log_of_request(post_data, address, '200', cube=cube)
        except Exception:
            print("add_log_of_request success-path failed")
            print(traceback.format_exc())

        if post_data.get("SAVE_SOLVE"):
            try:
                saved_payload = save_parsed_solve(post_data, cube, parsed_solve)
                response_payload["saved_solve"] = saved_payload["solve"]
                response_payload["session"] = saved_payload["session"]
            except Exception:
                print("save_parsed_solve failed")
                print(traceback.format_exc())
                response_payload["save_error"] = traceback.format_exc()

        return jsonify(response_payload)

    except Exception as e:
        print(traceback.format_exc())
        try:
            add_log_of_request(post_data or {}, address, '404', error=traceback.format_exc())
        except Exception:
            print("add_log_of_request error-path failed")
            print(traceback.format_exc())
        return make_response({"error": "An error occurred", "details": traceback.format_exc()}, 500)

@app.route('/options', methods=['OPTIONS'])
def handle_options_request():
    response = make_response("", 200)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    return response

def run_flask_server():
    # Using Flask's built-in server
    # app.run(host='0.0.0.0', port = 8080)
    app.run()

def main():
    run_flask_server()

if __name__ == '__main__':
    main()
