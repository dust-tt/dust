import { decrypt,encrypt } from '@dust-tt/types';
import React, { useState } from 'react';

const HashingExample: React.FC = () => {
  const [text, setText] = useState('');
  const [key, setKey] = useState('');
  const [encrypted, setEncrypted] = useState('');
  const [decrypted, setDecrypted] = useState('');

  const handleEncrypt = () => {
    const encryptedText = encrypt(text, key);
    setEncrypted(encryptedText);
  };

  const handleDecrypt = () => {
    const decryptedText = decrypt(text, key);
    setDecrypted(decryptedText);
  };

  return (
    <div>
      <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Text" />
      <input type="text" value={key} onChange={e => setKey(e.target.value)} placeholder="Key" />
      <button onClick={handleEncrypt}>Encrypt</button>
      <button onClick={handleDecrypt}>Decrypt</button>
      <p>Encrypted: {encrypted}</p>
      <p>Decrypted: {decrypted}</p>
    </div>
  );
};

export default HashingExample;