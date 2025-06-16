import spacy

nlp = spacy.load("pt_core_news_lg")

def remover_nomes(texto):
    doc = nlp(texto)
    nomes_para_remover = [ent.text for ent in doc.ents if ent.label_ == "PER"]
    for nome in nomes_para_remover:
        texto = texto.replace(nome, "")
    return texto.strip()


def retornar_nome(texto):
    doc = nlp(texto)
    nomes = [ent.text for ent in doc.ents if ent.label_ == "PER"]
    nome_completo = ''
    for nome in nomes:

        nome_completo = nome + '' 

    return nome_completo




