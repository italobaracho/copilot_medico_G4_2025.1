# server.py

import sys
import os
import json
import uuid

from flask import Flask, request, jsonify
from flask_cors import CORS
from backend import gemini_connection
from backend import pdf_reader
from backend import text_filter
from backend import patient_db

app = Flask(__name__)
CORS(app)





# NOVO ENDPOINT: Verificar existência do Patient ID
@app.route('/api/patient-exists/<patient_id>', methods=['GET'])
def check_patient_exists_api(patient_id):
    """
    Verifica se um paciente com o ID fornecido existe no banco de dados.
    Retorna JSON com 'exists': true/false.
    """
    try:
        patient_data = patient_db.get_patient_data(patient_id)
        exists = patient_data is not None
        return jsonify({"status": "success", "exists": exists}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": f"Erro ao verificar existência do paciente: {e}"}), 500

# NOVO ENDPOINT: Criar Paciente
@app.route('/api/patients', methods=['POST'])
def create_patient():
    """
    Cria um novo paciente e retorna seu ID e nome.
    Espera um JSON com 'name' (opcional).
    """
    try:
        data = request.json
        patient_name = data.get('name')

        new_patient_id = patient_db.generate_patient_id()
        patient_data = patient_db.ensure_patient_exists(new_patient_id, name=patient_name) # Cria o paciente
        
        # Opcional: Adicionar a primeira "consulta" padrão ao criar o paciente
        first_consultation_id = patient_db.add_consultation_to_patient(new_patient_id, "Primeira Consulta")

        return jsonify({
            "status": "success",
            "patient_id": new_patient_id,
            "patient_name": patient_data.get("name", "Desconhecido"),
            "first_consultation_id": first_consultation_id # Retorna o ID da primeira consulta
        }), 201 # 201 Created

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": f"Erro interno do servidor ao criar paciente: {e}"}), 500


# Ajustar o endpoint do Chat para usar o histórico da consulta selecionada
@app.route('/api/chat', methods=['POST'])
def handle_chat_message():
    try:
        data = request.json
        if not data or 'message' not in data:
            return jsonify({"status": "error", "message": "Requisição inválida."}), 400

        user_message = data['message']
        patient_id = data.get('patient_id')
        consultation_id = data.get('consultation_id') # NOVO: ID da consulta atual

        new_patient_id_generated = None

        if not patient_id: # Se não tem patient_id, cria um novo
            patient_id = patient_db.generate_patient_id()
            new_patient_id_generated = patient_id
            patient_db.ensure_patient_exists(patient_id, name="Desconhecido") # Pode passar um nome padrão ou pedir no front

        # Se não tem consultation_id, ou se o paciente é novo, cria uma primeira consulta
        if not consultation_id:
            # Buscar a primeira consulta se o paciente já existir e tiver consultas
            patient_data = patient_db.get_patient_data(patient_id)
            if patient_data and patient_data.get("consultations"):
                consultation_id = patient_data["consultations"][0]["id"]
            else:
                # Caso contrário, cria uma nova consulta
                consultation_id = patient_db.add_consultation_to_patient(patient_id)
                if not consultation_id:
                    raise Exception("Falha ao criar consulta para o paciente.")


        print(f"\nMensagem recebida para Paciente ID {patient_id}, Consulta ID {consultation_id}: {user_message}")

        filtered_user_message = text_filter.remover_nomes(user_message)
        
        # Agora, adicione a mensagem ao histórico da consulta específica
        patient_db.add_message_to_consultation_history(patient_id, consultation_id, "user", filtered_user_message if filtered_user_message else user_message)

        # Recuperar o histórico da consulta para enviar ao Gemini
        # ATENÇÃO: gemini_connection.send_message espera `patient_id` e `message_text`.
        # Você está passando `chat_history` como terceiro argumento, o que não é o esperado.
        # Conforme discutimos, `send_message` deve buscar o histórico internamente.
        # A assinatura correta é send_message(patient_id: str, consultation_id: str, message_text: str)
        ai_response_text = gemini_connection.send_message(patient_id, consultation_id, filtered_user_message)
        
        # Adicionar a resposta da IA ao histórico da consulta
        patient_db.add_message_to_consultation_history(patient_id, consultation_id, "model", ai_response_text)
        
        response_data = {
            "status": "success",
            "ai_response": ai_response_text,
            "consultation_id": consultation_id # Retorna o ID da consulta atual
        }
        if new_patient_id_generated:
            response_data["patient_id"] = new_patient_id_generated

        return jsonify(response_data), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": f"Erro interno do servidor: {e}"}), 500


# Ajustar o endpoint de Upload de PDF
@app.route('/api/upload-pdf', methods=['POST'])
def upload_pdf():
    try:
        if 'pdf' not in request.files:
            return jsonify({"status": "error", "message": "Nenhum arquivo enviado."}), 400

        file = request.files['pdf']
        patient_id = request.form.get('patient_id')
        consultation_id = request.form.get('consultation_id') # NOVO: ID da consulta

        new_patient_id_generated = None

        if not patient_id:
            patient_id = patient_db.generate_patient_id()
            new_patient_id_generated = patient_id
            patient_db.ensure_patient_exists(patient_id)
        
        # Assegura que há uma consultation_id
        if not consultation_id:
            patient_data = patient_db.get_patient_data(patient_id)
            if patient_data and patient_data.get("consultations"):
                consultation_id = patient_data["consultations"][0]["id"]
            else:
                consultation_id = patient_db.add_consultation_to_patient(patient_id)
                if not consultation_id:
                    raise Exception("Falha ao criar consulta para o paciente durante upload de PDF.")

        extracted_text = pdf_reader.extract_text_from_pdf(file)
        if not extracted_text.strip():
            return jsonify({"status": "error", "message": "Texto extraído está vazio."}), 400

        filtered_extracted_text = text_filter.remover_nomes(extracted_text)
        
        context_message_for_pdf = f"O seguinte texto foi extraído de um PDF enviado pelo usuário: \"{filtered_extracted_text}\". Por favor, analise-o e responda às perguntas subsequentes ou forneça um resumo, conforme apropriado."
        
        # Adiciona a mensagem ao histórico da consulta
        patient_db.add_message_to_consultation_history(patient_id, consultation_id, "user", context_message_for_pdf)
        
        # Recuperar o histórico da consulta para enviar ao Gemini
        # ATENÇÃO: gemini_connection.send_message espera `patient_id` e `message_text`.
        # Você está passando `chat_history` como terceiro argumento, o que não é o esperado.
        # A assinatura correta é send_message(patient_id: str, consultation_id: str, message_text: str)
        ai_response_text = gemini_connection.send_message(patient_id, consultation_id, context_message_for_pdf)
        
        # Adiciona a resposta da IA ao histórico da consulta
        patient_db.add_message_to_consultation_history(patient_id, consultation_id, "model", ai_response_text)

        response_data = {
            "status": "success",
            "message": "Texto extraído e enviado para a IA com sucesso.",
            "extracted_text_preview": extracted_text[:200] + "...",
            "ai_response": ai_response_text,
            "consultation_id": consultation_id
        }
        if new_patient_id_generated:
            response_data["patient_id"] = new_patient_id_generated
            
        return jsonify(response_data), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": f"Erro interno ao processar o PDF: {e}"}), 500


# NOVO ENDPOINT: Gerenciar Consultas de um Paciente (GET para listar, POST para criar)
@app.route('/api/patients/<patient_id>/consultations', methods=['GET', 'POST']) # <--- MUDANÇA AQUI: Adicionado 'POST'
def handle_patient_consultations(patient_id): # Renomeei a função para ser mais genérica
    if request.method == 'POST':
        # Lógica para CRIAR uma nova consulta
        try:
            data = request.get_json()
            consultation_title = data.get('title')

            if not consultation_title:
                consultation_title = f"Consulta em {datetime.now().strftime('%Y-%m-%d %H:%M')}"

            # Chama a função no seu patient_db para adicionar a consulta
            # Você precisa ter uma função como add_consultation_to_patient no seu patient_db.py
            new_consultation_id = patient_db.add_consultation_to_patient(patient_id, consultation_title)

            if new_consultation_id:
                # Retorna o ID da nova consulta e o título para o frontend
                return jsonify({
                    "status": "success",
                    "message": "Consulta criada com sucesso.",
                    "consultation_id": new_consultation_id,
                    "consultation_title": consultation_title # Retorna o título para o frontend
                }), 201 # Status 201 para "Created"
            else:
                return jsonify({"status": "error", "message": "Falha ao criar nova consulta no banco de dados."}), 500

        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({"status": "error", "message": f"Erro interno ao criar consulta: {e}"}), 500

    elif request.method == 'GET':
        # Lógica para OBTER a lista de consultas (seu código existente)
        try:
            consultations = patient_db.get_patient_consultations(patient_id)
            return jsonify({"status": "success", "consultations": consultations}), 200
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({"status": "error", "message": f"Erro ao recuperar consultas do paciente: {e}"}), 500
        

# NOVO ENDPOINT: Obter Histórico de uma Consulta Específica
@app.route('/api/patients/<patient_id>/consultations/<consultation_id>/history', methods=['GET'])
def get_consultation_history_api(patient_id, consultation_id):
    """
    Retorna o histórico de chat de uma consulta específica.
    """
    try:
        history = patient_db.get_consultation_chat_history(patient_id, consultation_id)
        return jsonify({"status": "success", "history": history}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": f"Erro ao recuperar histórico da consulta: {e}"}), 500
    
# CORREÇÃO AQUI: @app.route deve estar diretamente acima da função.
@app.route('/api/all-patients', methods=['GET'])
def get_all_patients():
    """
    Retorna uma lista de todos os pacientes (ID e Nome) para o frontend.
    """
    try:
        patients_info = patient_db.get_all_patients_info()
        return jsonify({"status": "success", "patients": patients_info}), 200
    except Exception as e:
        # É uma boa prática logar o erro completo para depuração
        import traceback
        traceback.print_exc() 
        return jsonify({"status": "error", "message": f"Erro ao obter lista de pacientes: {e}"}), 500


if __name__ == '__main__':
    print("Servidor Flask com Gemini e DB de Paciente iniciado.")
    app.run(host='0.0.0.0', port=3001, debug=True)