import json
import os
import uuid
from datetime import datetime

# Define o caminho para o arquivo do banco de dados, garantindo que seja relativo ao diretório atual do script.
DB_FILE = os.path.join(os.path.dirname(__file__), 'patients_db.json')

def load_database():
    """
    Carrega o banco de dados JSON do arquivo.
    Retorna um dicionário vazio se o arquivo não existir, estiver vazio ou for inválido.
    """
    if not os.path.exists(DB_FILE):
        return {}
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (IOError, json.JSONDecodeError):
        # Em caso de erro de leitura ou JSON malformado, retorna um dicionário vazio
        # Isso evita que a aplicação trave, mas pode significar perda de dados se o arquivo estiver corrompido.
        print(f"Aviso: Não foi possível carregar o banco de dados de {DB_FILE}. Criando um novo.")
        return {} 

def save_database(db_data):
    """
    Salva o banco de dados JSON no arquivo.
    """
    try:
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(db_data, f, ensure_ascii=False, indent=2)
    except IOError:
        print(f"Erro: Não foi possível salvar o banco de dados em {DB_FILE}")

def generate_patient_id():
    """
    Gera um ID de paciente único usando UUID (Universally Unique Identifier).
    """
    return str(uuid.uuid4())

def get_patient_data(patient_id):
    """
    Recupera todos os dados de um paciente específico pelo seu ID.
    Retorna None se o paciente não for encontrado.
    """
    db = load_database()
    return db.get(patient_id)

def get_all_patients_info():
    """
    Retorna uma lista de dicionários, cada um contendo o 'id' e o 'name'
    de todos os pacientes registrados no banco de dados.
    """
    db = load_database()
    patients_list = []
    for patient_id, patient_data in db.items():
        patients_list.append({
            "id": patient_id,
            # Usa o nome do paciente ou um fallback se o nome não estiver disponível
            "name": patient_data.get("name", f"Paciente {patient_id[:8]}") 
        })
    return patients_list

def ensure_patient_exists(patient_id, name=None):
    """
    Verifica se um paciente com o given `patient_id` existe no banco de dados.
    Se não existir, uma nova entrada para o paciente é criada com o nome fornecido (ou "Desconhecido").
    Se o paciente existir e o nome for "Desconhecido", e um novo nome for fornecido, ele é atualizado.
    Retorna os dados completos do paciente (existente ou recém-criado).
    """
    db = load_database()
    patient_data = db.get(patient_id)

    if not patient_data:
        # Paciente não existe, cria um novo
        patient_data = {
            "name": name if name else "Desconhecido",
            "chat_history": [],  # Histórico geral do paciente (se ainda usado por alguma rota legacy)
            "consultations": []  # Lista para armazenar consultas específicas do paciente
        }
        db[patient_id] = patient_data
        save_database(db)
    elif name and patient_data.get("name", "Desconhecido") == "Desconhecido":
        # Atualiza o nome se um novo nome for fornecido e o atual for o fallback
        patient_data["name"] = name
        save_database(db)
        
    return db[patient_id]

# Esta função parece ser um resquício de uma estrutura anterior onde o histórico era por paciente
# Se o histórico de chat agora é por consulta, esta função pode ser depreciada ou removida se não for mais usada.
def get_patient_chat_history(patient_id):
    """
    Recupera o histórico de chat geral de um paciente.
    (Pode ser obsoleto se todo o histórico for gerenciado por consultas)
    """
    patient_data = get_patient_data(patient_id)
    if patient_data:
        return patient_data.get("chat_history", [])
    return []

# Esta função também parece ser um resquício. 
# Se você está usando add_message_to_consultation_history, esta pode ser depreciada.
def add_message_to_history(patient_id: str, role: str, text: str):
    """
    Adiciona uma mensagem ao histórico geral do paciente.
    'role' pode ser 'user' ou 'model'.
    (Pode ser obsoleto se todo o histórico for gerenciado por consultas)
    """
    db = load_database()
    if patient_id not in db:
        print(f"Aviso: Paciente {patient_id} não encontrado ao adicionar mensagem. Criando entrada.")
        ensure_patient_exists(patient_id)
        db = load_database() # Recarrega após possível criação

    message_parts_for_gemini = [{'text': text}]

    if patient_id in db and "chat_history" in db[patient_id]:
        db[patient_id]["chat_history"].append({
            "role": role,
            "parts": message_parts_for_gemini,
            "timestamp": datetime.now().isoformat()
        })
    else:
        print(f"Erro crítico: Estrutura do paciente {patient_id} não encontrada ou incompleta no DB.")
        # Tenta inicializar a estrutura para evitar falha completa
        db[patient_id] = db.get(patient_id, {})
        db[patient_id]["name"] = db[patient_id].get("name", "Desconhecido")
        db[patient_id]["chat_history"] = [{
            "role": role,
            "parts": message_parts_for_gemini,
            "timestamp": datetime.now().isoformat()
        }]

    save_database(db)

def add_consultation_to_patient(patient_id: str, consultation_title: str = None, consultation_date: str = None, initial_history: list[dict] = None):
    """
    Adiciona uma nova consulta a um paciente existente.
    Cria uma nova consulta com um ID único.
    Permite fornecer um 'initial_history' que será o chat_history inicial desta consulta.
    Se 'initial_history' não for fornecido, a consulta começa com um histórico vazio.
    Retorna o ID da nova consulta.
    """
    db = load_database()
    patient_data = db.get(patient_id)

    if not patient_data:
        print(f"Erro: Paciente {patient_id} não encontrado para adicionar consulta.")
        return None

    consultation_id = str(uuid.uuid4())
    new_consultation = {
        "id": consultation_id,
        "title": consultation_title if consultation_title else f"Consulta em {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "date": consultation_date if consultation_date else datetime.now().isoformat(),
        # Se initial_history for fornecido, usa-o; caso contrário, inicia com uma lista vazia.
        "chat_history": initial_history if initial_history is not None else [] 
    }
    
    # Garante que a chave 'consultations' exista para o paciente
    if "consultations" not in patient_data:
        patient_data["consultations"] = []
    
    patient_data["consultations"].append(new_consultation)
    save_database(db)
    return consultation_id

def get_patient_consultations(patient_id: str) -> list[dict]:
    """
    Retorna a lista de todas as consultas associadas a um paciente.
    Retorna uma lista vazia se o paciente não tiver consultas ou não existir.
    """
    patient_data = get_patient_data(patient_id)
    if patient_data:
        return patient_data.get("consultations", [])
    return []

def get_consultation_chat_history(patient_id: str, consultation_id: str) -> list[dict]:
    """
    Recupera o histórico de chat de uma consulta específica de um paciente.
    Retorna uma lista vazia se a consulta ou o paciente não forem encontrados.
    """
    patient_data = get_patient_data(patient_id)
    if patient_data and "consultations" in patient_data:
        for consultation in patient_data["consultations"]:
            if consultation["id"] == consultation_id:
                return consultation.get("chat_history", [])
    return []

def add_message_to_consultation_history(patient_id: str, consultation_id: str, role: str, text: str):
    """
    Adiciona uma nova mensagem (do usuário ou do modelo) ao histórico de chat
    de uma consulta específica de um paciente.
    """
    db = load_database()
    patient_data = db.get(patient_id)

    if not patient_data or "consultations" not in patient_data:
        print(f"Erro: Paciente {patient_id} ou suas consultas não encontradas para adicionar mensagem.")
        return

    consultation_found = False
    for consultation in patient_data["consultations"]:
        if consultation["id"] == consultation_id:
            message_parts_for_gemini = [{'text': text}]
            consultation["chat_history"].append({
                "role": role,
                "parts": message_parts_for_gemini,
                "timestamp": datetime.now().isoformat()
            })
            consultation_found = True
            break
    
    if consultation_found:
        save_database(db)
    else:
        print(f"Erro: Consulta {consultation_id} não encontrada para o paciente {patient_id}.")