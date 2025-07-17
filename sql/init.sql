-- ==========================================
-- 在庫管理システム - メイン初期化スクリプト
-- ==========================================
-- NOTE: 個別SQLファイルがdocker-entrypoint-initdb.dで自動実行されるため
--       このファイルでは初期化完了の確認のみ実行

-- データベース初期化完了確認
SELECT 
    'データベース初期化完了' as status, 
    NOW() as end_time,
    '在庫管理システム v1.0.0' as system_info;

-- テーブル作成状況確認
SELECT 
    TABLE_NAME as 'テーブル名',
    TABLE_ROWS as 'レコード数',
    TABLE_COMMENT as '説明'
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_TYPE = 'BASE TABLE'
    AND TABLE_NAME NOT LIKE 'INFORMATION_%'
ORDER BY TABLE_NAME;

-- 基本テーブル確認
SELECT 'connection_test' as table_name, COUNT(*) as record_count FROM connection_test
UNION ALL
SELECT 'users' as table_name, COUNT(*) as record_count FROM users
UNION ALL
SELECT 'system_settings' as table_name, COUNT(*) as record_count FROM system_settings;