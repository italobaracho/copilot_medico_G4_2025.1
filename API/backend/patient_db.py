# patient_db.py

import json
import os
import uuid
from datetime import datetime

DB_FILE = os.path.join(os.path.dirname(__file__), 'patients_db.json')

def load_database():
    """Carrega o banco de dados JSON do arquivo."""
    if not os.path.exists(DB_FILE):
        return {}
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (IOError, json.JSONDecodeError):
        return {} # Retorna um dicionário vazio em caso de erro ou arquivo vazio

def save_database(db_data):
    """Salva o banco de dados JSON no arquivo."""
    try:
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(db_data, f, ensure_ascii=False, indent=2)
    except IOError:
        print(f"Erro: Não foi possível salvar o banco de dados em {DB_FILE}")

def generate_patient_id():
    """Gera um ID de paciente único (UUID)."""
    return str(uuid.uuid4())

def get_patient_data(patient_id):
    """Recupera os dados de um paciente específico."""
    db = load_database()
    return db.get(patient_id)

# --- NOVO: Função para obter todos os pacientes com ID e Nome ---
def get_all_patients_info():
    """
    Retorna uma lista de dicionários, cada um contendo 'id' e 'name' de todos os pacientes.
    """
    db = load_database()
    patients_list = []
    for patient_id, patient_data in db.items():
        # Garante que o 'name' exista, usando um fallback se não estiver presente
        patients_list.append({
            "id": patient_id,
            "name": patient_data.get("name", f"Paciente {patient_id[:8]}") # Exibe os 8 primeiros chars do ID como fallback
        })
    return patients_list
# --- FIM DO NOVO CÓDIGO ---


def ensure_patient_exists(patient_id, name=None):
    """
    Garante que um paciente exista no banco de dados.
    Se não existir, cria uma nova entrada.
    Retorna os dados completos do paciente.
    """
    db = load_database()
    patient_data = db.get(patient_id)

    if not patient_data:
        # Paciente não existe, cria um novo
        patient_data = {
            "name": name if name else "Desconhecido", # Nome opcional
            "chat_history": [], # Histórico no formato para Gemini
            "consultations": [] # Novo: Para armazenar múltiplas consultas
        }
        db[patient_id] = patient_data
        save_database(db)
    elif name and patient_data.get("name", "Desconhecido") == "Desconhecido":
        # Atualiza o nome se um novo nome for fornecido e o atual for "Desconhecido"
        patient_data["name"] = name
        save_database(db)
        
    return db[patient_id] # Sempre retorna os dados do paciente, seja novo ou existente

def get_patient_chat_history(patient_id):
    """Recupera o histórico de chat de um paciente formatado para o Gemini."""
    patient_data = get_patient_data(patient_id)
    if patient_data:
        return patient_data.get("chat_history", [])
    return []

def add_message_to_history(patient_id: str, role: str, text: str):
    """
    Adiciona uma mensagem ao histórico do paciente.
    'role' pode ser 'user' ou 'model'.
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
        db[patient_id] = db.get(patient_id, {})
        db[patient_id]["name"] = db[patient_id].get("name", "Desconhecido")
        db[patient_id]["chat_history"] = [{
            "role": role,
            "parts": message_parts_for_gemini,
            "timestamp": datetime.now().isoformat()
        }]

    save_database(db)


def add_consultation_to_patient(patient_id: str, consultation_title: str = None, consultation_date: str = None):
    """
    Adiciona uma nova consulta a um paciente existente.
    Cria uma nova consulta com um ID único e histórico de chat vazio para aquela consulta.
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
        "chat_history": [] # Histórico específico desta consulta
    }
    
    if "consultations" not in patient_data:
        patient_data["consultations"] = []
    
    patient_data["consultations"].append(new_consultation)
    save_database(db)
    return consultation_id

def get_patient_consultations(patient_id: str) -> list[dict]:
    """Retorna a lista de consultas de um paciente."""
    patient_data = get_patient_data(patient_id)
    if patient_data:
        return patient_data.get("consultations", [])
    return []

def get_consultation_chat_history(patient_id: str, consultation_id: str) -> list[dict]:
    """Recupera o histórico de chat de uma consulta específica."""
    patient_data = get_patient_data(patient_id)
    if patient_data and "consultations" in patient_data:
        for consultation in patient_data["consultations"]:
            if consultation["id"] == consultation_id:
                return consultation.get("chat_history", [])
    return []

def add_message_to_consultation_history(patient_id: str, consultation_id: str, role: str, text: str):
    """
    Adiciona uma mensagem ao histórico de uma consulta específica de um paciente.
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