import json
import boto3
import os
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Attr

# İstemcileri başlat
# Not: Bu kod AWS ortamında çalıştırıldığında IAM rolleri sayesinde yetki alacaktır.
# Yerel testlerde AWS CLI yapılandırması gereklidir.
dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client('bedrock-runtime')
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')

# Sabitler ve Ortam Değişkenleri
# Bu değişkenler Lambda konfigürasyonunda tanımlanmalıdır.
TABLE_NAME = os.environ.get('BOOKS_TABLE_NAME', 'LibraryBooks')
KNOWLEDGE_BASE_ID = os.environ.get('KNOWLEDGE_BASE_ID')
MODEL_ID = os.environ.get('MODEL_ID', "anthropic.claude-3-sonnet-20240229-v1:0")

def get_book_availability(book_title):
    """
    DynamoDB'de kitap arar ve durumunu döner.
    Structured Data (Yapısal Veri) Sorgusu
    """
    table = dynamodb.Table(TABLE_NAME)
    
    try:
        # Basitlik için Scan kullanıyoruz. Prod ortamında GSI veya Query kullanılmalı.
        print(f"DynamoDB'de aranıyor: {book_title}")
        response = table.scan(
            FilterExpression=Attr('title').contains(book_title)
        )
        items = response.get('Items', [])
        
        if not items:
            return f"Katalogda '{book_title}' isminde bir kitap bulunamadı."
            
        results = []
        for item in items:
            status = "Müsait" if item.get('isAvailable') else "Ödünç Verilmiş"
            results.append(f"Kitap: {item.get('title')}, Yazar: {item.get('author')}, Durum: {status}, ID: {item.get('bookId')}")
            
        return "\n".join(results)
    except Exception as e:
        print(f"DynamoDB Error: {e}")
        return "Veritabanı hatası nedeniyle kitap durumu kontrol edilemedi."

def handler(event, context):
    """
    Lambda Ana Handler Fonksiyonu
    """
    print("Event:", json.dumps(event))
    
    try:
        # 1. Gelen mesajı al
        body = json.loads(event.get('body', '{}'))
        user_message = body.get('message')
        session_id = body.get('session_id') # İleride session yönetimi için kullanılabilir
        
        if not user_message:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Mesaj alanı zorunludur.'})
            }

        # 2. Bedrock Converse API Yapılandırması
        # Sistem Mesajı (Persona)
        system_prompts = [{
            "text": "Sen profesyonel, kibar ve yardımsever bir kütüphane asistanısın. "
                    "Kullanıcıların kitap bulmasına yardımcı oluyorsun. "
                    "Eğer kullanıcı spesifik bir kitabın durumunu veya varlığını sorarsa, 'check_book_availability' aracını kullan. "
                    "Eğer genel bir soru sorarsa veya kütüphane kuralları hakkında bilgi isterse aracı kullanma. "
                    "Yanıtlarını Türkçe ver."
        }]

        # Araç Tanımı (Tool Definition) - Function Calling
        tool_config = {
            "tools": [
                {
                    "toolSpec": {
                        "name": "check_book_availability",
                        "description": "Kütüphane kataloğunda kitap arar ve müsaitlik durumunu kontrol eder.",
                        "inputSchema": {
                            "json": {
                                "type": "object",
                                "properties": {
                                    "book_title": {
                                        "type": "string",
                                        "description": "Aranacak kitabın adı veya başlığı."
                                    }
                                },
                                "required": ["book_title"]
                            }
                        }
                    }
                }
            ]
        }

        # Mesaj Geçmişi
        messages = [{
            "role": "user",
            "content": [{"text": user_message}]
        }]

        # 3. Bedrock'a İlk Çağrı (Intent Detection)
        print("Bedrock Converse çağrılıyor...")
        response = bedrock.converse(
            modelId=MODEL_ID,
            messages=messages,
            system=system_prompts,
            toolConfig=tool_config
        )
        
        output_message = response['output']['message']
        messages.append(output_message)
        
        final_text = ""

        # 4. Tool Use Kontrolü (Structured Data)
        if response['stopReason'] == 'tool_use':
            print("Tool kullanımı tespit edildi.")
            tool_requests = output_message['content']
            
            for content_block in tool_requests:
                if 'toolUse' in content_block:
                    tool_use = content_block['toolUse']
                    tool_name = tool_use['name']
                    tool_use_id = tool_use['toolUseId']
                    
                    if tool_name == 'check_book_availability':
                        # Aracı çalıştır (DynamoDB Sorgusu)
                        book_title = tool_use['input']['book_title']
                        tool_result_text = get_book_availability(book_title)
                        
                        # Sonucu mesaj geçmişine ekle
                        messages.append({
                            "role": "user",
                            "content": [{
                                "toolResult": {
                                    "toolUseId": tool_use_id,
                                    "content": [{"text": tool_result_text}]
                                }
                            }]
                        })
            
            # 5. Bedrock'a İkinci Çağrı (Sonuç ile birlikte yanıt üretimi)
            final_response = bedrock.converse(
                modelId=MODEL_ID,
                messages=messages,
                system=system_prompts,
                toolConfig=tool_config
            )
            final_text = final_response['output']['message']['content'][0]['text']
            
        else:
            # 6. Tool kullanılmadıysa Knowledge Base'e sor (Unstructured Data / RAG)
            print("Tool kullanılmadı, Knowledge Base (RAG) akışı başlatılıyor...")
            
            if KNOWLEDGE_BASE_ID:
                try:
                    # RetrieveAndGenerate API kullanımı
                    rag_response = bedrock_agent_runtime.retrieve_and_generate(
                        input={
                            'text': user_message
                        },
                        retrieveAndGenerateConfiguration={
                            'type': 'KNOWLEDGE_BASE',
                            'knowledgeBaseConfiguration': {
                                'knowledgeBaseId': KNOWLEDGE_BASE_ID,
                                'modelArn': f'arn:aws:bedrock:us-east-1::foundation-model/{MODEL_ID}'
                            }
                        }
                    )
                    final_text = rag_response['output']['text']
                    print("RAG yanıtı alındı.")
                except Exception as e:
                    print(f"RAG Error: {e}")
                    # RAG hata verirse veya yapılandırılmamışsa Converse'den gelen ilk yanıtı kullan (Fallback)
                    final_text = output_message['content'][0]['text']
            else:
                # KB ID yoksa Converse yanıtını kullan
                print("Knowledge Base ID tanımlı değil, standart yanıt dönülüyor.")
                final_text = output_message['content'][0]['text']

        # 7. Yanıtı Dön
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', # CORS
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': json.dumps({'response': final_text})
        }

    except Exception as e:
        print(f"Critical Error: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': 'Sunucu hatası', 'details': str(e)})
        }