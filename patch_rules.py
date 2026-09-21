import re

with open('firestore.rules', 'r') as f:
    content = f.read()

# 1. Update isAuthenticated
old_isAuth = """    function isAuthenticated() {
      // Wymagamy weryfikacji e-mail dla zwykłych użytkowników.
      // Konta techniczne (telewizory) dodawane ręcznie z konsoli nie mają flagi email_verified,
      // dlatego robimy dla nich bezpieczny wyjątek (adres musi zawierać 'tv', 'monitor' lub 'prodsss').
      return request.auth != null && 
             request.auth.token.email.matches('.*@erplast\\\\.pl$') && 
             (request.auth.token.email_verified == true || 
              request.auth.token.email.lower().matches('.*tv.*') || 
              request.auth.token.email.lower().matches('.*monitor.*') ||
              request.auth.token.email.lower().matches('.*prodsss.*'));
    }"""
new_isAuth = """    function isAuthenticated() {
      return request.auth != null && 
             request.auth.token.email.matches('.*@erplast\\\\.pl$') && 
             request.auth.token.email_verified == true;
    }

    function isNotReadOnly() {
      let role = get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
      return role != 'tv-monitor' && role != 'podglad';
    }

    function canWrite() {
      return isAuthenticated() && isNotReadOnly();
    }"""
content = content.replace(old_isAuth, new_isAuth)

# 2. Replace general read, write
content = content.replace('allow read, write: if isAuthenticated();', 'allow read: if isAuthenticated();\n      allow write: if canWrite();')

# 3. Fix orders
content = content.replace('allow update: if isAuthenticated() && isValidOrder(request.resource.data);', 'allow update: if canWrite() && isValidOrder(request.resource.data);')

# 4. Fix workLogs
content = content.replace('allow create: if isAuthenticated() && isValidWorkLog(request.resource.data);', 'allow create: if canWrite() && isValidWorkLog(request.resource.data);')
content = content.replace('allow update: if isAuthenticated();', 'allow update: if canWrite();')

# 5. Fix workSessions
content = content.replace('allow create: if isAuthenticated() && isValidWorkSession(request.resource.data);', 'allow create: if canWrite() && isValidWorkSession(request.resource.data);')

# 6. Fix system
content = content.replace('allow write: if isAuthenticated();', 'allow write: if canWrite();')

# 7. Fix inventoryTransactions
content = content.replace('allow create: if isAuthenticated();', 'allow create: if canWrite();')

with open('firestore.rules', 'w') as f:
    f.write(content)
