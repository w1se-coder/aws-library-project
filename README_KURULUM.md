# Kütüphane Asistanı Projesi - Kurulum Rehberi

Bu proje, AWS Serverless teknolojileri kullanılarak geliştirilmiş, yapay zeka destekli bir kütüphane asistanıdır.

## 1. Ön Hazırlıklar

AWS hesabınız aktifleştiğinde aşağıdaki adımları takip ederek projeyi canlıya alabilirsiniz.

### Gereksinimler
- AWS CLI (Kurulu ve yapılandırılmış)
- Node.js ve NPM
- Python 3.11+
- AWS CDK (`npm install -g aws-cdk`)

## 2. Kurulum Adımları

### Adım 1: AWS Kimlik Doğrulama
Terminalde aşağıdaki komutu çalıştırarak AWS hesabınıza giriş yapın:
```bash
aws configure
```
Access Key ID, Secret Access Key ve Region (örn: us-east-1) bilgilerinizi girin.

### Adım 2: Sanal Ortamı Aktifleştirme
```bash
# Windows için
.venv\Scripts\activate
```

### Adım 3: Bağımlılıkları Yükleme
```bash
pip install -r requirements.txt
```

### Adım 4: CDK Bootstrap (İlk kez çalıştırıyorsanız)
```bash
cdk bootstrap
```

### Adım 5: Projeyi Deploy Etme
```bash
cdk deploy
```
Bu işlem yaklaşık 5-10 dakika sürecektir. İşlem bittiğinde terminalde "Outputs" başlığı altında bazı değerler göreceksiniz.

## 3. Frontend Yapılandırması

Deploy işlemi bittikten sonra terminal çıktısında (Outputs) şu değerleri not edin:
- `UserPoolId`
- `UserPoolClientId`
- `LibraryAssistantApiEndpoint`

Bu değerleri `frontend/script.js` dosyasındaki `CONFIG` bölümüne yazın:

```javascript
const CONFIG = {
    userPoolId: 'us-east-1_xxxxxxxxx',  // Outputs'dan gelen UserPoolId
    clientId: 'xxxxxxxxxxxxxxxxxxxx',   // Outputs'dan gelen UserPoolClientId
    apiUrl: 'https://...'               // Outputs'dan gelen ApiEndpoint + /chat
};
```
**Önemli:** `apiUrl` değerinin sonuna `/chat` eklemeyi unutmayın (eğer CDK çıktısında yoksa).

## 4. Çalıştırma

`frontend/index.html` dosyasını bir tarayıcıda açarak uygulamayı test edebilirsiniz.

## 5. Veri Yükleme (Opsiyonel)

Kütüphane kataloğuna kitap eklemek için AWS Konsolu -> DynamoDB -> LibraryBooks tablosuna giderek "Create Item" diyebilirsiniz.
Örnek Veri:
```json
{
  "bookId": "1",
  "title": "Nutuk",
  "author": "Mustafa Kemal Atatürk",
  "isAvailable": true
}
```
