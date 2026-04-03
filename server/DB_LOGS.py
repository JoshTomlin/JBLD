import os
import json
import psycopg2
from datetime import datetime
from BLD_Parser import Cube

def convert_to_num(value):
    
    if value is None:
        return None

    value = value.strip()

    if ":" in value:
        #print('found colon')
        minutes, seconds = value.split(":")
        #print(minutes, seconds, float(minutes) * 60 + float(seconds))
        return float(minutes) * 60 + round(float(seconds), 2)

    #print(float(value))
    return float(value)
    

# cube.solve_stats is a list of info about each move. When a comm is found, info about the comm is stored in ['comment']
# Want to form a list of algs used, how long each alg too to execute, how many edge, corner, flip, twists and parities there are and recog time between algs.

# {'count': 1, 'move': 'L', 'ed': 5, 'cor': 1, 'comment': {}, 'diff': 0.7908496732026143, 'perm': 'blah'} I think ed, cor are number solved
# 'comment': {'comm': ['C', 'B', ' twist'], 'piece_type_2': {'edge': False, 'corner': True, 'parity': False}, 'piece_type': 'corner', 'parse_lp': 'CB twist', 'moves_from_start': 29, 'count_moves': 16, 'piece_change': 'corners', 'alg_str': ["U R' D R D' R' D R U' R' D' R D R' D' R", {'edge': False, 'corner': True, 'parity': False}], 'alg_time': 1.94, 'alg_str_original': "U R' D R D' R' D R U' R' D' R D R' D' R"}

# Idea for finding flip algs: Cancel comms that have helpers, then check if two letters are on same piece
def process_solve_stats(stats, move_times):

    #if(stats[-1]['ed'] != 12 or stats[-1]['cor'] != 8):
     #   print('DNF solve')
      #  return {}

    edge_comms = [] # (comm, recog, exec, alg)
    cor_comms = [] # (comm, recog, exec, alg)
    parity = {}
    alg_total = 0
    move_count = 0
    metadata = {}
    comm_events = []

    cur_recog = 0
    new_alg = False
    cur_move_index = 0
    i = 0
    for move in stats:
        i += 1
        print(i)
        if new_alg:
            if cur_move_index == 0:
                cur_recog = move_times[cur_move_index]
            else:
                cur_recog = move_times[cur_move_index] - move_times[cur_move_index - 1]
            new_alg = False

        if move['comment']:
            if 'mistake' in move['comment'].keys():
                break

            data = {}
            data['recog'] = cur_recog
            print(move['comment'])
            data['exe'] = move['comment']['alg_time']
            data['comm'] = move['comment']['comm']
            data['alg'] = move['comment']['alg_str'][0]
            data['alg_length'] = alg_length(data['alg'])
            move_count += data['alg_length']

            data['comm'][0] = data['comm'][0].strip()
            data['comm'][1] = data['comm'][1].strip()
            data['comm'][2] = data['comm'][2].strip()

            if move['comment']['piece_type_2']['edge']:
                # Check for cancellation with a helper
                if edge_comms:
                    if edge_comms[-1]['comm'][0] == data['comm'][0] and edge_comms[-1]['comm'][2] == data['comm'][1]:
                        edge_comms[-1]['comm'] = cancel_edge_comms(edge_comms[-1]['comm'], data['comm'])
                        edge_comms[-1]['exe'] += data['exe']
                        edge_comms[-1]['alg'] = edge_comms[-1]['alg'] + " " + data['alg']
                        edge_comms[-1]['alg_length'] += data['alg_length']
                    else:
                        data['phase'] = 'edge'
                        edge_comms.append(data)
                        comm_events.append(data)

                else: 
                    data['phase'] = 'edge'
                    edge_comms.append(data)
                    comm_events.append(data)
            elif move['comment']['piece_type_2']['corner']:
                # Check for cancellation with a helper
                if cor_comms:
                    if cor_comms[-1]['comm'][0] == data['comm'][0] and cor_comms[-1]['comm'][2] == data['comm'][1]:
                        cor_comms[-1]['comm'] = cancel_corner_comms(cor_comms[-1]['comm'], data['comm'])
                        cor_comms[-1]['exe'] += data['exe']
                        cor_comms[-1]['alg'] = cor_comms[-1]['alg'] + " " + data['alg']
                        cor_comms[-1]['alg_length'] += data['alg_length']
                    else:
                        data['phase'] = 'corner'
                        cor_comms.append(data)
                        comm_events.append(data)
                else:
                        data['phase'] = 'corner'
                        cor_comms.append(data)
                        comm_events.append(data)
            elif move['comment']['piece_type_2']['parity']:
                data['phase'] = 'parity'
                parity = data
                comm_events.append(data)

            new_alg = True

        cur_move_index += 1

    alg_total = len(edge_comms) + len(cor_comms)
    has_parity = False
    if parity:
        has_parity = True
        alg_total += 1
    

    metadata['edge_comms'] = edge_comms
    metadata['corner_comms'] = cor_comms
    metadata['parity'] = parity
    metadata['comm_events'] = comm_events
    metadata['alg_total'] = alg_total
    metadata['has_parity'] = has_parity
    metadata['move_count'] = move_count
    

    return metadata

def cancel_edge_comms(comm1, comm2):
    if comm1[0] != comm2[0] or comm1[2] != comm2[1]:
        print('No cancellation')
        return comm1
    
    new_comm = comm1
    new_comm[2] = comm2[2]

    if is_flip(new_comm[1], new_comm[2]):
        # cancelled into FLIP
        new_comm[2] = 'flip'

    return new_comm

def cancel_corner_comms(comm1, comm2):
    if comm1[0] != comm2[0] or comm1[2] != comm2[1]:
        print('No cancellation')
        return comm1
    
    new_comm = comm1
    new_comm[2] = comm2[2]

    twist = is_twist(new_comm[1], new_comm[2])

    if twist == 1:
        # cancelled into TWIST cw for 2nd piece
        new_comm[2] = 'twist'
    if twist == -1:
        # cancelled into TWIST ccw for 2nd piece
        new_comm[2] = 'twist'

    return new_comm
            
def is_flip(a, b):
    # hard coded because I cbf
    opp_edge = {'A': 'Q', 'B': 'M', 'D':'E', 'E':'D', 'F':'L', 'G':'X', 'H':'R', 'J':'P', 'K':'U', 'L':'F', 'N':'T', 'O':'V', 'P':'J', 'Q':'A', 'R':'H', 'S':'W', 'T':'N', 'U':'K', 'V':'O', 'W':'S', 'X':'G'}
    return a == opp_edge[b]

# return 0 for different, 1 for cw, -1 for ccw.
def is_twist(a, b):
    corners = [['A','E','R'], ['B', 'Q', 'N'], ['D','I','F'], ['U','G','L'], ['V', 'K', 'P'], ['W', 'O', 'T'], ['X', 'S', 'H']]
    for piece in corners:
        if a in piece and b in piece:
            x = piece.index(a)
            y = piece.index(b)

            if x == y: 
                return 0
            if y == x + 1 or y == x - 2:
                return 1
            else:
                return -1
    return 0

def alg_length(alg):
    return alg.strip().count(' ') + 1

def solve_length(metadata):
    moves = 0
    for comm in metadata['edge_comms']:
        moves += comm['alg_length']
    for comm in metadata['corner_comms']:
        moves += comm['alg_length']
    if metadata['parity']:
        moves += metadata['parity']['alg_length']
    return moves

def calc_pauses(metadata):
    total = 0
    for comm in metadata['edge_comms']:
        total += comm['recog']
    for comm in metadata['corner_comms']:
        total += comm['recog']
    if metadata['parity']:
        total += metadata['parity']['recog']
    return total

def total_algs(metadata):
    total = 0
    if metadata['has_parity']:
        total = 1
    
    return total + len(metadata['edge_comms']) + len(metadata['corner_comms'])


def add_log_of_request(request, ip, status, cube=None, error=None):
    DB_HOST = os.getenv("DB_HOST")
    DB_NAME = os.getenv("DB_NAME")
    DB_USER = os.getenv("DB_USER")
    DB_PASS = os.getenv("DB_PASS")
    


    post_data = json.dumps(request)
  
    user_id = os.environ["ID"]
    cur_time_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
    
    conn = psycopg2.connect(dbname=DB_NAME, user=DB_USER, password=DB_PASS, host=DB_HOST)
    cur = conn.cursor()
    
    if cube:
        print('Calculating times')
        memo_time = convert_to_num(cube.memo_time)
        time_solve = convert_to_num(cube.time_solve)
        exe_time = convert_to_num(cube.exe_time)
        fluidness = cube.fluidness
        success = cube.success
        #print(memo_time, time_solve, exe_time)
        
        #print('algs')
        #print(cube.algs_executed)
        print('Process solve stats')
        print('move times:', cube.moves_time)
        print(cube.solve_stats)
        solve_metadata = process_solve_stats(cube.solve_stats, cube.moves_time)

        sl = solve_length(solve_metadata)
        total_pauses = calc_pauses(solve_metadata)
        ta = total_algs(solve_metadata)
        turns_per_second = round(sl / exe_time, 2)

        print('move times:', cube.moves_time)

        cur.execute("INSERT INTO LOGS (REQUEST, POST_TXT, POST_URL, STATUS, IP, SOLVE_TIME, EXE, MEMO, FLUIDNESS, DATE, SUCCESS, ID, SOLVE_METADATA, TOTAL_MOVES, TOTAL_ALGS, TPS, TOTAL_PAUSES) VALUES (%s,%s,%s,%s,%s,%s,%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", 
                    (post_data, cube.parsed_solve["txt"], cube.parsed_solve["cubedb"], status, ip, time_solve, exe_time, memo_time, fluidness, cur_time_str, success, user_id, json.dumps(solve_metadata), sl, ta, turns_per_second, total_pauses))
    else:
        cur.execute("INSERT INTO LOGS (REQUEST, STATUS, IP, DATE, ID, ERROR) VALUES (%s,%s,%s,%s,%s,%s)", 
                    (post_data, status, ip, cur_time_str, user_id, error))
    
    conn.commit()
    cur.close()
    conn.close()

def main():
    stats = [{'count': 0, 'move': '', 'ed': 7, 'cor': 6, 'comment': {}}, {'count': 1, 'move': 'U', 'ed': 7, 'cor': 3, 'comment': {}, 'diff': 0.7908496732026143, 'perm': '3 4 10 47 5 20 1 29 7 19 8 9 13 14 15 27 17 18 37 26 39 22 23 24 25 11 30 28 6 16 31 32 33 34 35 36 46 2 48 40 41 42 43 44 45 21 38 12 49 50 51 52 53 54 '}, {'count': 2, 'move': 'U', 'ed': 8, 'cor': 3, 'comment': {}, 'diff': 0.7843137254901961, 'perm': '9 2 19 11 5 38 3 29 1 37 4 7 13 14 15 27 17 18 46 26 48 22 23 24 25 20 30 28 8 16 31 32 33 34 35 36 10 6 12 40 41 42 43 44 45 39 47 21 49 50 51 52 53 54 '}, {'count': 3, 'move': "R'", 'ed': 5, 'cor': 2, 'comment': {}, 'diff': 0.6797385620915033, 'perm': '27 2 19 13 5 38 21 29 1 37 4 7 17 14 11 36 15 12 9 26 48 22 23 33 25 20 52 28 8 18 31 32 49 34 35 46 16 24 10 40 41 42 43 44 45 39 47 30 6 50 51 3 53 54 '}, {'count': 4, 'move': 'L', 'ed': 2, 'cor': 0, 'comment': {}, 'diff': 0.39215686274509803, 'perm': '27 2 28 13 5 42 21 29 19 39 22 25 17 14 11 36 15 12 9 26 7 31 23 33 34 20 52 54 8 18 51 32 49 48 35 46 16 24 10 38 41 44 37 40 43 45 47 30 6 50 4 3 53 1 '}, {'count': 5, 'move': 'F', 'ed': 2, 'cor': 0, 'comment': {}, 'diff': 0.4117647058823529, 'perm': '25 2 39 29 5 8 27 42 21 9 20 19 17 14 11 36 15 12 16 22 10 31 23 33 34 24 52 54 13 18 51 32 49 48 35 46 28 26 30 38 41 44 37 40 43 7 47 45 6 50 4 3 53 1 '}, {'count': 6, 'move': 'F', 'ed': 4, 'cor': 0, 'comment': {}, 'diff': 0.43137254901960786, 'perm': '19 2 9 42 5 13 25 8 27 16 24 21 17 14 11 36 15 12 28 20 30 31 23 33 34 26 52 54 29 18 51 32 49 48 35 46 39 22 45 38 41 44 37 40 43 10 47 7 6 50 4 3 53 1 '}, {'count': 7, 'move': 'R', 'ed': 7, 'cor': 2, 'comment': {}, 'diff': 0.7320261437908496, 'perm': '19 2 46 42 5 11 25 8 9 10 6 3 13 14 15 27 17 18 28 20 21 31 23 24 34 26 30 54 29 16 51 32 33 48 35 36 39 22 45 38 41 44 37 40 43 12 47 7 49 50 4 52 53 1 '}, {'count': 8, 'move': "L'", 'piece': 'edges', 'diff_moves': 8, 'ed': 10, 'cor': 6, 'comment': {'comm': ['C', 'A', 'U'], 'piece_type_2': {'edge': True, 'corner': False, 'parity': False}, 'piece_type': 'edge', 'parse_lp': 'AU', 'moves_from_start': 4, 'count_moves': 4, 'piece_change': 'edges', 'alg_str': ["U2 M' U2 M", {'edge': True, 'corner': False, 'parity': False}], 'alg_time': 0.68, 'alg_str_original': "U2 M' U2 M"}, 'diff': 0.9477124183006536, 'perm': '1 2 46 38 5 11 7 8 9 10 6 3 13 14 15 27 17 18 19 20 21 22 23 24 25 26 30 28 29 16 31 32 33 34 35 36 37 4 39 40 41 42 43 44 45 12 47 48 49 50 51 52 53 54 '}, {'count': 9, 'move': "F'", 'ed': 6, 'cor': 3, 'comment': {}, 'diff': 0.7908496732026143, 'perm': '1 2 46 38 5 11 45 42 39 7 6 3 8 14 15 21 17 18 25 22 19 26 23 20 27 24 10 16 13 9 31 32 33 34 35 36 37 4 28 40 41 29 43 44 30 12 47 48 49 50 51 52 53 54 '}, {'count': 10, 'move': 'B', 'ed': 2, 'cor': 0, 'comment': {}, 'diff': 0.45751633986928103, 'perm': '43 40 48 38 5 11 45 42 39 7 6 37 8 14 2 21 17 3 25 22 19 26 23 20 27 24 10 16 13 9 31 32 33 18 15 12 34 4 28 35 41 29 36 44 30 1 51 54 47 50 53 46 49 52 '}, {'count': 11, 'move': "U'", 'ed': 2, 'cor': 0, 'comment': {}, 'diff': 0.39869281045751637, 'perm': '43 40 39 20 5 47 45 42 21 9 2 19 6 14 4 12 17 1 25 22 10 26 23 11 27 24 46 16 13 3 31 32 33 18 15 48 34 8 28 35 41 29 36 44 30 7 51 54 38 50 53 37 49 52 '}, {'count': 12, 'move': "F'", 'ed': 2, 'cor': 0, 'comment': {}, 'diff': 0.26143790849673204, 'perm': '43 40 28 22 5 47 30 29 19 39 2 25 6 14 4 12 17 1 27 26 7 24 23 11 21 20 46 9 8 3 31 32 33 18 15 48 34 42 16 35 41 13 36 44 10 45 51 54 38 50 53 37 49 52 '}, {'count': 13, 'move': 'U', 'ed': 2, 'cor': 0, 'comment': {}, 'diff': 0.42483660130718953, 'perm': '43 40 28 22 5 11 30 29 37 48 6 25 8 14 2 21 17 3 27 26 1 24 23 20 39 38 10 7 4 9 31 32 33 18 15 12 34 42 16 35 41 13 36 44 19 45 51 54 47 50 53 46 49 52 '}, {'count': 14, 'move': 'F', 'ed': 3, 'cor': 0, 'comment': {}, 'diff': 0.5163398692810458, 'perm': '43 40 39 20 5 11 45 42 37 48 6 19 13 14 2 27 17 3 25 22 1 26 23 24 9 38 30 10 4 16 31 32 33 18 15 12 34 8 28 35 41 29 36 44 21 7 51 54 47 50 53 46 49 52 '}, {'count': 15, 'move': "B'", 'ed': 7, 'cor': 3, 'comment': {}, 'diff': 0.7843137254901961, 'perm': '1 2 39 20 5 11 45 42 3 46 6 19 13 14 15 27 17 18 25 22 12 26 23 24 9 38 30 10 4 16 31 32 33 34 35 36 37 8 28 40 41 29 43 44 21 7 47 48 49 50 51 52 53 54 '}, {'count': 16, 'move': "R'", 'ed': 4, 'cor': 2, 'comment': {}, 'diff': 0.49673202614379086, 'perm': '1 2 39 20 5 13 45 42 21 9 24 19 17 14 11 36 15 12 25 22 10 26 23 33 27 38 52 16 4 18 31 32 49 34 35 46 37 8 28 40 41 29 43 44 30 7 47 48 6 50 51 3 53 54 '}, {'count': 17, 'move': 'F', 'ed': 6, 'cor': 4, 'comment': {}, 'diff': 0.7516339869281046, 'perm': '1 2 9 24 5 29 7 8 27 16 26 21 17 14 11 36 15 12 19 20 30 22 23 33 25 38 52 28 4 18 31 32 49 34 35 46 37 13 39 40 41 42 43 44 45 10 47 48 6 50 51 3 53 54 '}, {'count': 18, 'move': 'R', 'piece': 'edges', 'diff_moves': 10, 'ed': 9, 'cor': 6, 'comment': {'comm': ['D', 'M', 'U'], 'piece_type_2': {'edge': True, 'corner': False, 'parity': False}, 'piece_type': 'edge', 'parse_lp': 'DMU', 'moves_from_start': 12, 'count_moves': 8, 'alg_str': ["S R' F' R S' R' F R", {'edge': True, 'corner': False, 'parity': False}], 'alg_time': 1.04, 'alg_str_original': "S R' F' R S' R' F R"}, 'diff': 0.9411764705882353, 'perm': '1 2 46 6 5 29 7 8 9 10 26 3 13 14 15 27 17 18 19 20 21 22 23 24 25 38 30 28 4 16 31 32 33 34 35 36 37 11 39 40 41 42 43 44 45 12 47 48 49 50 51 52 53 54 '}, {'count': 19, 'move': "U'", 'ed': 7, 'cor': 3, 'comment': {}, 'diff': 0.7973856209150327, 'perm': '7 4 37 2 5 29 9 6 3 46 26 1 13 14 15 27 17 18 10 11 12 22 23 24 25 20 30 28 8 16 31 32 33 34 35 36 19 47 21 40 41 42 43 44 45 48 38 39 49 50 51 52 53 54 '}, {'count': 20, 'move': 'L', 'ed': 4, 'cor': 1, 'comment': {}, 'diff': 0.6862745098039216, 'perm': '25 22 39 2 5 29 9 6 3 46 26 19 13 14 15 27 17 18 10 11 12 31 23 24 34 20 30 54 8 16 51 32 33 48 35 36 28 47 21 38 41 44 37 40 43 7 42 45 49 50 4 52 53 1 '}, {'count': 21, 'move': "R'", 'ed': 1, 'cor': 0, 'comment': {}, 'diff': 0.43137254901960786, 'perm': '25 22 39 2 5 29 27 24 21 9 26 19 17 14 11 36 15 12 16 13 10 31 23 33 34 20 52 54 8 18 51 32 49 48 35 46 28 47 30 38 41 44 37 40 43 7 42 45 6 50 4 3 53 1 '}, {'count': 22, 'move': 'F', 'ed': 1, 'cor': 0, 'comment': {}, 'diff': 0.42483660130718953, 'perm': '19 20 9 2 5 42 25 26 27 16 22 21 17 14 11 36 15 12 28 29 30 31 23 33 34 24 52 54 13 18 51 32 49 48 35 46 39 47 45 38 41 44 37 40 43 10 8 7 6 50 4 3 53 1 '}, {'count': 23, 'move': 'F', 'ed': 2, 'cor': 0, 'comment': {}, 'diff': 0.43790849673202614, 'perm': '21 24 16 2 5 8 19 22 25 28 20 27 17 14 11 36 15 12 39 42 45 31 23 33 34 26 52 54 29 18 51 32 49 48 35 46 9 47 7 38 41 44 37 40 43 30 13 10 6 50 4 3 53 1 '}, {'count': 24, 'move': "L'", 'ed': 5, 'cor': 2, 'comment': {}, 'diff': 0.6405228758169934, 'perm': '21 24 16 2 5 8 1 4 7 19 20 27 17 14 11 36 15 12 37 38 39 22 23 33 25 26 52 28 29 18 31 32 49 34 35 46 9 47 48 40 41 42 43 44 45 30 13 10 6 50 51 3 53 54 '}, {'count': 25, 'move': 'R', 'ed': 8, 'cor': 3, 'comment': {}, 'diff': 0.7320261437908496, 'perm': '3 6 10 2 5 8 1 4 7 19 20 9 13 14 15 27 17 18 37 38 39 22 23 24 25 26 30 28 29 16 31 32 33 34 35 36 46 47 48 40 41 42 43 44 45 21 11 12 49 50 51 52 53 54 '}, {'count': 26, 'move': "U'", 'piece': 'edges', 'diff_moves': 8, 'ed': 12, 'cor': 6, 'comment': {'comm': ['D', 'U', 'B'], 'piece_type_2': {'edge': True, 'corner': False, 'parity': False}, 'piece_type': 'edge', 'parse_lp': 'DUB', 'moves_from_start': 17, 'count_moves': 5, 'alg_str': ["U' M' U2 M U'", {'edge': True, 'corner': False, 'parity': False}], 'alg_time': 1.8, 'alg_str_original': "U' M' U2 M U'"}, 'diff': 0.934640522875817, 'perm': '1 2 46 4 5 6 7 8 9 10 11 3 13 14 15 27 17 18 19 20 21 22 23 24 25 26 30 28 29 16 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 12 47 48 49 50 51 52 53 54 '}, {'count': 27, 'move': "D'", 'ed': 8, 'cor': 3, 'comment': {}, 'diff': 0.7647058823529411, 'perm': '1 2 46 4 5 6 7 8 9 10 11 3 13 14 15 45 26 27 19 20 21 22 23 24 43 44 28 34 31 25 35 32 29 36 33 30 37 38 39 40 41 42 52 53 54 12 47 48 49 50 51 16 17 18 '}, {'count': 28, 'move': "R'", 'ed': 5, 'cor': 2, 'comment': {}, 'diff': 0.6274509803921569, 'perm': '1 2 9 4 5 24 7 8 27 16 13 21 17 14 11 45 26 36 19 20 30 22 23 33 43 44 28 34 31 25 35 32 29 46 49 52 37 38 39 40 41 42 3 53 54 10 47 48 6 50 51 18 15 12 '}, {'count': 29, 'move': 'D', 'ed': 8, 'cor': 3, 'comment': {}, 'diff': 0.7843137254901961, 'perm': '1 2 9 4 5 24 7 8 18 52 13 21 53 14 11 27 17 34 19 20 36 22 23 35 25 26 30 28 29 16 31 32 33 46 49 43 37 38 39 40 41 42 3 44 45 10 47 48 6 50 51 54 15 12 '}, {'count': 30, 'move': 'R', 'ed': 9, 'cor': 3, 'comment': {}, 'diff': 0.8104575163398693, 'perm': '1 2 46 4 5 6 7 8 16 30 11 3 53 14 15 9 13 34 19 20 27 22 23 35 25 26 21 28 29 10 31 32 24 36 33 43 37 38 39 40 41 42 52 44 45 12 47 48 49 50 51 54 17 18 '}, {'count': 31, 'move': 'U', 'ed': 5, 'cor': 1, 'comment': {}, 'diff': 0.6339869281045751, 'perm': '3 6 10 2 5 8 1 4 16 30 20 9 53 14 15 7 13 34 37 38 27 22 23 35 25 26 39 28 29 19 31 32 24 36 33 43 46 47 48 40 41 42 52 44 45 21 11 12 49 50 51 54 17 18 '}, {'count': 32, 'move': "R'", 'ed': 5, 'cor': 1, 'comment': {}, 'diff': 0.6405228758169934, 'perm': '21 24 16 2 5 8 1 4 18 52 20 27 53 14 11 7 17 34 37 38 36 22 23 35 25 26 39 28 29 19 31 32 33 46 49 43 9 47 48 40 41 42 3 44 45 30 13 10 6 50 51 54 15 12 '}, {'count': 33, 'move': "D'", 'ed': 2, 'cor': 0, 'comment': {}, 'diff': 0.39215686274509803, 'perm': '21 24 25 2 5 8 1 4 27 16 20 45 17 14 11 7 26 36 37 38 30 22 23 33 43 44 39 34 31 19 35 32 29 46 49 52 9 47 48 40 41 42 3 53 54 28 13 10 6 50 51 18 15 12 '}, {'count': 34, 'move': 'R', 'ed': 4, 'cor': 1, 'comment': {}, 'diff': 0.5882352941176471, 'perm': '3 6 25 2 5 8 1 4 9 10 20 45 13 14 15 7 26 27 37 38 21 22 23 24 43 44 39 34 31 19 35 32 29 36 33 30 46 47 48 40 41 42 52 53 54 28 11 12 49 50 51 16 17 18 '}, {'count': 35, 'move': 'D', 'ed': 8, 'cor': 4, 'comment': {}, 'diff': 0.7973856209150327, 'perm': '3 6 16 2 5 8 1 4 9 10 20 27 13 14 15 7 17 18 37 38 21 22 23 24 25 26 39 28 29 19 31 32 33 34 35 36 46 47 48 40 41 42 43 44 45 30 11 12 49 50 51 52 53 54 '}, {'count': 36, 'move': "R'", 'ed': 5, 'cor': 2, 'comment': {}, 'diff': 0.6928104575163399, 'perm': '21 24 18 2 5 8 1 4 27 16 20 36 17 14 11 7 15 12 37 38 30 22 23 33 25 26 39 28 29 19 31 32 49 34 35 46 9 47 48 40 41 42 43 44 45 52 13 10 6 50 51 3 53 54 '}, {'count': 37, 'move': "D'", 'ed': 2, 'cor': 0, 'comment': {}, 'diff': 0.47058823529411764, 'perm': '21 24 27 2 5 8 1 4 45 25 20 30 26 14 11 7 15 12 37 38 28 22 23 29 43 44 39 34 31 19 35 32 49 36 33 46 9 47 48 40 41 42 52 53 54 16 13 10 6 50 51 3 17 18 '}, {'count': 38, 'move': 'R', 'ed': 4, 'cor': 1, 'comment': {}, 'diff': 0.5490196078431373, 'perm': '3 6 9 2 5 8 1 4 45 25 20 21 26 14 15 7 17 18 37 38 28 22 23 29 43 44 39 34 31 19 35 32 33 27 24 36 46 47 48 40 41 42 30 53 54 10 11 12 49 50 51 52 13 16 '}, {'count': 39, 'move': "U'", 'ed': 8, 'cor': 4, 'comment': {}, 'diff': 0.7516339869281046, 'perm': '1 2 3 4 5 6 7 8 45 25 11 12 26 14 15 9 17 18 19 20 28 22 23 29 43 44 21 34 31 10 35 32 33 27 24 36 37 38 39 40 41 42 30 53 54 46 47 48 49 50 51 52 13 16 '}, {'count': 40, 'move': "R'", 'ed': 5, 'cor': 2, 'comment': {}, 'diff': 0.6209150326797386, 'perm': '1 2 21 4 5 24 7 8 45 25 13 10 26 14 11 27 15 12 19 20 28 22 23 29 43 44 30 34 31 16 35 32 49 36 33 46 37 38 39 40 41 42 52 53 54 9 47 48 6 50 51 3 17 18 '}, {'count': 41, 'move': 'D', 'ed': 8, 'cor': 4, 'comment': {}, 'diff': 0.7908496732026143, 'perm': '1 2 21 4 5 24 7 8 27 16 13 10 17 14 11 18 15 12 19 20 30 22 23 33 25 26 36 28 29 52 31 32 49 34 35 46 37 38 39 40 41 42 43 44 45 9 47 48 6 50 51 3 53 54 '}, {'count': 42, 'move': 'R', 'piece': 'corners', 'diff_moves': 16, 'ed': 12, 'cor': 8, 'comment': {'comm': ['B', 'P', ' twist'], 'piece_type_2': {'edge': False, 'corner': True, 'parity': False}, 'piece_type': 'corner', 'parse_lp': 'BP twist', 'moves_from_start': 33, 'count_moves': 16, 'piece_change': 'corners', 'alg_str': ["D' R' D R U R' D' R D R' D' R U' R' D R", {'edge': False, 'corner': True, 'parity': False}], 'alg_time': 5.22, 'alg_str_original': "D' R' D R U R' D' R D R' D' R U' R' D R"}, 'diff': 0.9281045751633987, 'perm': '1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 '}]
    
    process_solve_stats(stats)
    print('Process solve stats')
    solve_metadata = process_solve_stats(stats)
    print('done')
    x = solve_length(solve_metadata)
    total_pauses = calc_pauses(solve_metadata)
    y = total_algs(solve_metadata)
    #TPS = solve_length / memo_time
    print(x, y, total_pauses)


if __name__ == "__main__":
    main()
